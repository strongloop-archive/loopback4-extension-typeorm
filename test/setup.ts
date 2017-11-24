'use strict';
import * as Dockerode from 'dockerode';
import {Stream} from 'stream';
import * as debug from 'debug';

const debugMsg = debug('setup');
import {get, includes, isEmpty, pick} from 'lodash';
const async = require('async');
const spawn = require('child_process').spawn;
const docker = new Dockerode();
const fmt = require('util').format;
const http = require('http');
const ms = require('ms');

// we don't pass any node flags, so we can call _mocha instead the wrapper
const mochaBin = require.resolve('mocha/bin/_mocha');

process.env.MYSQL_DATABASE = 'testdb';
process.env.MYSQL_PASSWORD = 'pass';
process.env.MYSQL_USERNAME = 'root';

// these are placeholders. They get set dynamically based on what IP and port
// get assigned by docker.
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_HOST = 'TBD';
process.env.MYSQL_URL = 'TBD';

const CONNECT_RETRIES = 30;
const CONNECT_DELAY = ms('5s');

let containerToDelete: Dockerode.Container;
// tslint:disable:no-any
// tslint:disable:no-shadowed-variable
async.waterfall(
  [
    dockerStart('mysql:latest'),
    sleep(ms('5s')),
    setEnv,
    waitFor(),
    sleep(ms('5s')),
    createDB('testdb'),
    run([
      mochaBin,
      '--timeout',
      '40000',
      '--recursive',
      './dist/test/**.test.js',
    ]),
  ],
  function(testErr: Error) {
    dockerCleanup(function(cleanupErr: Error) {
      if (cleanupErr) {
        console.error('error cleaning up:', cleanupErr);
      }
      if (testErr) {
        console.error('error running tests:', testErr);
        process.exit(1);
      }
    });
  },
);

function sleep(n: number) {
  return function delayedPassThrough() {
    const args = [].slice.call(arguments);
    // last argument is the callback
    const next = args.pop();
    // prepend `null` to indicate no error
    args.unshift(null);
    setTimeout(function() {
      next.apply(null, args);
    }, n);
  };
}

function dockerStart(imgName: string) {
  return function pullAndStart(next: Function) {
    console.log('pulling image: %s', imgName);
    docker.pull(imgName, function(err: Error, stream: Stream) {
      docker.modem.followProgress(stream, function(err: Error, output: any) {
        if (err) {
          return next(err);
        }
        console.log('starting container from image: %s', imgName);
        docker.createContainer(
          {
            Image: imgName,
            HostConfig: {
              PublishAllPorts: true,
            },
            Env: [
              `MYSQL_ROOT_USER=${process.env.MYSQL_USERNAME}`,
              `MYSQL_ROOT_PASSWORD=${process.env.MYSQL_PASSWORD}`,
            ],
          },
          function(err, container: Dockerode.Container) {
            console.log(
              'recording container for later cleanup: ',
              container.id,
            );
            containerToDelete = container;
            if (err) {
              return next(err);
            }
            container.start((err: Error, data: any) => {
              next(err, container);
            });
          },
        );
      });
    });
  };
}

function setEnv(container: Dockerode.Container, next: Function) {
  container.inspect(function(err, c) {
    // if swarm, Node.Ip will be set to actual node's IP
    // if not swarm, but remote docker, use docker host's IP
    // if local docker, use localhost
    const host = get(c, 'Node.IP', get(docker, 'modem.host', '127.0.0.1'));
    // container's port 3306 is dynamically mapped to an external port
    const port = get(c, [
      'NetworkSettings',
      'Ports',
      '3306/tcp',
      '0',
      'HostPort',
    ]) as string;
    process.env.MYSQL_PORT = port;
    process.env.MYSQL_HOST = host;
    const usr = process.env.MYSQL_USERNAME;
    const pass = process.env.MYSQL_PASSWORD;
    console.log(
      'env:',
      pick(process.env, [
        'MYSQL_HOST',
        'MYSQL_PORT',
        'MYSQL_USERNAME',
        'MYSQL_PASSWORD',
        'MYSQL_DATABASE',
      ]),
    );
    next(null, container);
  });
}

function waitFor() {
  return function waitForPing(container: Dockerode.Container, next: Function) {
    console.log('waiting for instance to respond');
    return ping(null, CONNECT_RETRIES);

    function ping(err: Error | null, tries: number) {
      console.log('ping (%d/%d)', CONNECT_RETRIES - tries, CONNECT_RETRIES);
      if (tries < 1) {
        next(err || new Error('failed to contact mysql'));
      }
      const expected = '1\n1';
      runDBCommand(container, 'SELECT 1', expected, function(err?: Error) {
        if (err) {
          debugMsg(`failed ping: ${err.message}`);
          tryAgain(err);
        } else {
          setImmediate(next, null, container);
        }
      });
      function tryAgain(err?: Error) {
        console.log('retrying...');
        setTimeout(ping, CONNECT_DELAY, err, tries - 1);
      }
    }
  };
}

function runDBCommand(
  container: Dockerode.Container,
  cmd: string,
  expectedOutput: string | null,
  next: (...args: any[]) => void,
) {
  container.exec(
    {
      Cmd: [
        '/bin/bash',
        '-c',
        `mysql -hlocalhost -p${process.env.MYSQL_PASSWORD} -P${
          process.env.MYSQL_PORT
        } --execute "${cmd};"`,
        // `mysql -h${process.env.MYSQL_HOST} -p${process.env
        // .MYSQL_PASSWORD} -P${process.env.MYSQL_PORT} --execute "${cmd};"`,
      ],
      AttachStdOut: true,
      AttachStdErr: true,
    },
    (err: Error, exec: Dockerode.Exec) => {
      if (err) {
        console.log(`DB command failed: ${err}`);
        next(err);
      } else {
        exec.start((error: Error, stream: NodeJS.ReadStream) => {
          if (error) {
            return next(error);
          }
          debugMsg('Data:');
          stream.setEncoding('utf-8');
          stream.once('data', (data: any) => {
            if (isEmpty(data)) {
              return next(new Error('(no data)'));
            }
            if (includes(data, 'ERROR')) {
              debugMsg(data);
              return next(new Error());
            } else {
              if (expectedOutput && !includes(data, expectedOutput)) {
                debugMsg(`expected: ${expectedOutput}, received: ${data}`);
                return next(new Error());
              }
              return next();
            }
          });
        });
      }
    },
  );
}

function createDB(db: string) {
  return function create(
    container: Dockerode.Container,
    next: (...args: any[]) => void,
  ) {
    console.log(`creating db: ${db}`);
    runDBCommand(
      container,
      `CREATE DATABASE IF NOT EXISTS ${db}`,
      null,
      (err?: Error) => {
        if (err) {
          debugMsg(`error creating db: ${err}`);
        }
        next(err, container);
      },
    );
  };
}

function run(cmd: string[]) {
  return function spawnNode(container: Dockerode.Container, next: Function) {
    console.log('running mocha...');
    spawn(process.execPath, cmd, {stdio: 'inherit'})
      .on('error', next)
      .on('exit', onExit);

    function onExit(code: number, sig: string) {
      if (code) {
        next(new Error(fmt('mocha exited with code: %j, sig: %j', code, sig)));
      } else {
        next();
      }
    }
  };
}

// clean up any previous containers
function dockerCleanup(next: Function) {
  // if (containerToDelete) {
  //   console.log('cleaning up container: %s', containerToDelete.id);
  //   containerToDelete.remove({force: true}, function(err) {
  //     next(err);
  //   });
  // } else {
  //   setImmediate(next);
  // }
  setImmediate(next);
}

// A Writable Stream that just consumes a stream. Useful for draining readable
// streams so that they 'end' properly, like sometimes-empty http responses.
function devNull() {
  return new Stream.Writable({
    write: function(_chunk, _encoding, cb) {
      return cb(null);
    },
  });
}
