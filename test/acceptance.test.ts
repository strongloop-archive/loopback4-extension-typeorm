import 'mocha';
import {expect} from '@loopback/testlab';
import {Application} from '@loopback/core';
import {TypeORMMixin} from '../src/index';
import {
  Repository,
  ConnectionOptions,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Connection,
  OneToMany,
  ManyToOne,
  JoinTable,
} from 'typeorm';
import * as util from 'util';

/* 
 * ============================================================================
 * FIXTURES
 * ============================================================================
 */
class TestApplication extends TypeORMMixin(Application) {
  connectionOne: Connection;
  connectionTwo: Connection;
  constructor() {
    super();
    const fakeConnectionInfo: ConnectionOptions = {
      host: process.env.MYSQL_HOST || 'localhost',
      database: process.env.MYSQL_DATABASE || 'testdb',
      port: Number.parseInt(process.env.MYSQL_PORT || '3306'),
      type: 'mysql',
      username: process.env.MYSQL_USERNAME || 'root',
      password: process.env.MYSQL_PASSWORD || 'pass',
      entities: [Customer, Order],
      synchronize: true,
    };
    console.log(
      `Connection Info: ${util.inspect(fakeConnectionInfo, undefined, 2)}`,
    );
    this.connectionOne = this.createTypeOrmConnection(
      Object.assign({name: 'one'}, fakeConnectionInfo),
    );
    this.connectionTwo = this.createTypeOrmConnection(
      Object.assign({name: 'two'}, fakeConnectionInfo),
    );

    this.typeOrmRepository(this.connectionOne, Order);
    this.typeOrmRepository(this.connectionTwo, Customer);
  }
}

@Entity()
class Order {
  @PrimaryGeneratedColumn() id: number;
  @Column() orderDate: Date;
  @ManyToOne(type => Customer, customer => customer.orders)
  customer: number;
  @Column({type: 'int', nullable: true})
  customerId: number;
}

@Entity()
class Customer {
  @PrimaryGeneratedColumn() id: number;
  @Column() name?: string;
  @Column() address?: string;
  @OneToMany(type => Order, order => order.customer)
  @JoinTable()
  orders: Order[];
}

/*
 * ============================================================================
 * TESTS 
 * ============================================================================
 */

describe('TypeORM Repository Mixin', () => {
  const app = new TestApplication();
  before(async () => {
    await app.start();
  });

  it('creates repository bindings', async () => {
    expect(await app.get(`repositories.Order`)).to.be.instanceof(Repository);
    expect(await app.get(`repositories.Customer`)).to.be.instanceof(Repository);
  });

  describe('operations', () => {
    // NOTE: This is not meant to be a fully functional set of CRUD tests.
    // TypeORM has its own suite of tests.
    it('can create entities', async () => {
      const customer = getCustomer();
      const repo = (await app.get(
        `repositories.${Customer.name}`,
      )) as Repository<Customer>;
      const foo = await repo.save(customer);
      const result = await repo.findOneById(foo.id);
      expect(result).to.deepEqual(foo);
    });

    it('can run more advanced queries', async () => {
      let customer = getCustomer();
      const customerRepo = (await app.get(
        'repositories.Customer',
      )) as Repository<Customer>;
      customer = await customerRepo.save(customer);
      let order = getOrder(customer.id);
      const orderRepo = (await app.get('repositories.Order')) as Repository<
        Order
      >;
      order = await orderRepo.save(order);

      let result = (await customerRepo
        .createQueryBuilder('customer')
        .innerJoinAndSelect('customer.orders', 'orders')
        .getOne()) as Customer;

      expect(result).to.containDeep(customer);
      expect(result.orders[0]).to.containDeep(order);
    });
  });

  after(async () => {
    await app.stop();
  });
});

function getCustomer(customer?: Partial<Customer>): Customer {
  const base = new Customer();
  base.id = 0;
  base.name = 'someName';
  base.address = '123 Fake St.';
  return Object.assign(base, customer);
}

function getOrder(customerId: number, order?: Partial<Order>): Order {
  const base = new Order();
  base.id = 0;
  base.orderDate = new Date('2012-12-25T00:00:00.000Z');
  base.customerId = customerId;
  return Object.assign(base, order);
}
