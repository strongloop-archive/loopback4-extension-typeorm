import {Application, Component, Server} from '@loopback/core';
import {Context, Binding, Constructor} from '@loopback/context';
import {Connection, Entity, BaseEntity, ConnectionOptions} from 'typeorm';
import {TypeORMConnectionManager} from './connection-manager';

// tslint:disable:no-any
export function TypeORMMixin(
  superClass: typeof Application,
): TypeORMApplicationClass {
  return class extends superClass {
    typeOrmConnectionManager: TypeORMConnectionManager;
    constructor(...args: any[]) {
      super(...args);
      this.typeOrmConnectionManager = new TypeORMConnectionManager();
      this.bind('typeorm.connections.manager').to(
        this.typeOrmConnectionManager,
      );
    }

    async start() {
      for (const connection of this.typeOrmConnectionManager.connections) {
        await connection.connect();
      }
      await super.start();
    }

    async stop() {
      for (const connection of this.typeOrmConnectionManager.connections) {
        await connection.close();
      }
      await super.stop();
    }

    /**
     * Register a TypeORM-based repository instance of the given class.
     * Generated repositories will be bound using the `repositories.{name}`
     * convention.
     *
     * ```ts
     * this.typeOrmRepository(Foo);
     * const fooRepo = this.getSync(`repositories.Foo`);
     * ```
     *
     * @param ctor The constructor (class) that represents the entity to
     * generate a repository for.
     */
    typeOrmRepository<S>(
      connection: Connection,
      ctor: Constructor<S>,
    ): Binding {
      // XXX(kjdelisle): I wanted to make this a provider, but it requires
      // the constructor instance to be available in the provider scope, which
      // would require injection of each constructor, so I had to settle for
      // this instead.
      return this.bind(`repositories.${ctor.name}`).toDynamicValue(async () => {
        if (!connection.isConnected) {
          await connection.connect();
        }
        return connection.getRepository(ctor);
      });
    }

    /**
     * Get an existing connection instance from the connection manager,
     * or create one if it does not exist. If you do not provide a name, a
     * default connection instance will be provided.
     * @param name The name of the connection (if it already exists)
     */
    getTypeOrmConnection(name?: string): Connection {
      return this.typeOrmConnectionManager.get(name);
    }

    /**
     * Create a new TypeORM connection with the provided set of options.
     * @param options
     */
    createTypeOrmConnection(options: ConnectionOptions): Connection {
      if (!options) {
        throw new Error('Connection options are required!');
      }
      return this.typeOrmConnectionManager.create(options);
    }
  };
}

/**
 * Define any implementation of Application.
 */

export interface TypeORMApplication extends Application {
  typeOrmRepository<S>(connection: Connection, ctor: Constructor<S>): Binding;
  createTypeOrmConnection(options: ConnectionOptions | Options): Connection;
  getTypeOrmConnection(name?: string): Connection;
}

export interface TypeORMApplicationClass
  extends Constructor<TypeORMApplication> {
  [property: string]: any;
}

export interface Options {
  [property: string]: any;
}
