# loopback4-extension-typeorm

A component to provide TypeORM in LoopBack 4

**DEPRECATED ALPHA: This is an experimental proof of concept showing how to implement a TypeORM mixin for LoopBack 4. The implementation is not currently supported for any production purpose and we are not maintaining this repository any more.**

## Usage
1. Install this plugin and some dependencies
```ts
npm install --save loopback4-extension-typeorm typeorm
```
2. In your application, make your own Application class, but instead of
extending `Application`, you'll want to call the provided mixin as your base
class.
```ts
import {Application} from '@loopback/core';
import {TypeORMRepositoryMixin} from 'loopback-typeorm';

export class MyApplication extends TypeORMRepositoryMixin(Application) {
  constructor() {
    super(...);
  }
}
```
3. Create a connection (or multiple!) in your new subclass, and define
whatever repositories you'd like to create. 

A helpful way to ensure that your configuration has all of the _required_ values
is to import the `ConnectionOptions` type from TypeORM directly.

**Note**: There are connection options that become required within different
use cases and contexts. For info on how to configure your database connection,
see the [TypeORM docs](https://github.com/typeorm/typeorm).

```ts
import {Application} from '@loopback/core';
import {TypeORMRepositoryMixin} from 'loopback-typeorm';
import {ConnectionOptions} from 'typeorm';
import {Order, Customer} from './models';

export class MyApplication extends TypeORMRepositoryMixin(Application) {
  mySqlConnection: Connection;
  constructor() {
    super();
    const connectionOptions: ConnectionOptions = {
      name: 'connectionName',
      host: 'somehost.com',
      database: 'mydb',
      port: 3306,
      type: 'mysql',
      username: 'admin',
      password: 'secretpassword',
      // etc...
    };
    this.mySqlConnection = this.createTypeOrmConnection(connectionOptions);

    // Automatically uses the connection to bind repositories to
    // your application context.
    this.typeOrmRepository(this.mySqlConnection, Order);
    this.typeOrmRepository(this.mySqlConnection, Customer);
   }
}
```
4. Finally, consume your repositories in your controllers!
```ts
import {Customer, CustomerSchema} from '../models';
import {Repository} from 'typeorm';

export class CustomerController {
  constructor(@inject('repositories.Customer') customerRepo: Repository) {
    // ...
  }

  @get('/customer/{id}')
  @param.path.number('id');
  async getCustomerById(id: number) {
    // Using TypeORM's repository!
    return await this.customerRepo.findOneById(id);
  }

  @post('/customer')
  @param.body('customer', CustomerSchema);
  async createCustomer(customer: Customer) {
    return await this.customerRepo.save(customer);
  }
}
```

## Testing
To run tests, you'll need an installation of Docker.
```
npm it
```

[![LoopBack](http://loopback.io/images/overview/powered-by-LB-xs.png)](http://loopback.io/)

