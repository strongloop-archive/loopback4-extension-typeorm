// For export

const nodeMajorVersion = +process.versions.node.split('.')[0];
module.exports =
  nodeMajorVersion >= 7 ? require('./dist/src') : require('./dist6/src');
