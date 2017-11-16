import {ConnectionManager, Connection} from 'typeorm';

export class TypeORMConnectionManager extends ConnectionManager {
  // This is to allow more direct access to the connection objects
  // during start/stop of the application.
  public connections: Connection[];
}
