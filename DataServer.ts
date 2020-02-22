import * as http from 'http';
import * as https from 'https';
import * as io from 'socket.io';
import { Jsoncoder } from '../jsoncoder';
import { Service, ServiceMap } from './common';

export type ServerMiddleware=((socket: io.Socket, fn: (err?: any) => void) => void)

type Packet<ServerServiceNames> = [
  'service',
  ServerServiceNames,
  string,
  (response: string) => void
];

export default class<ClientServiceNames extends string, ServerServiceNames extends string> {
  io: io.Server;
  jsonCoder = new Jsoncoder(new Map<any, (value: any) => any>([]), {});
  connections: Set<io.Socket> = new Set();
  serverServiceMap: ServiceMap<ServerServiceNames>;
  clientServiceMap: ServiceMap<ClientServiceNames>;

  constructor(server: http.Server|https.Server, private middleware: ServerMiddleware[], getServiceMap: (clientServiceMap: ServiceMap<ClientServiceNames>) => ServiceMap<ServerServiceNames>) {
    const ioConfig: io.ServerOptions = {
      cookie: false,
      origins: ['*:*'],
      serveClient: false,
    };
    this.clientServiceMap = new Proxy<ServiceMap<ClientServiceNames>>(
      {} as ServiceMap<ClientServiceNames>,
      {
        get: (t, key: ClientServiceNames) => (...args: any[]) =>
          this.emit(key, ...args)
      }
    );
    this.serverServiceMap = getServiceMap(this.clientServiceMap);

    this.io = io(server, ioConfig);
    for (const m of middleware) {
      this.io.use(m);
    }
    this.io.on('connect', (socket: io.Socket) => {
      console.log('server connect');
    });
    this.io.on('connection', () => {
      console.log('server connection');
    });
    this.io.on('connection', (socket: io.Socket) => {
      console.log('socket opened', socket.id);
      this.connections.add(socket);
      // @ts-ignore
      socket.use(async (packet: Packet<ServerServiceNames>, next) => {
        const [eventString, serviceName, data, ack] = packet;
        if (eventString !== 'service') {
          next();
          return;
        }
        let payload: any;
        console.log('service: ', serviceName);
        try {
          const service: Service = this.serverServiceMap[serviceName];
          const parameters = this.jsonCoder.parse(data, true);
          const serviceResult = await service(...parameters);
          payload = serviceResult;
        } catch (error) {
          console.error(error);
          payload = error;
        }
        ack(this.jsonCoder.stringify(payload));
      });
      const eventNames =
        'connect connection disconnect error reconnect disconnecting reconnecting ping pong';
      for (const event of eventNames.split(' ')) {
        socket.on(event, async () => {
          console.error('socket event:', event);
        });
      }
    });
  }

  async emit(event: ClientServiceNames, ...data: any[]): Promise<void> {
    return new Promise((resolve, reject): void => {
      for (const socket of this.connections) {
        socket.emit('service', event, this.jsonCoder.stringify(data));
      }
      resolve();
    });
  }

  // async close() {
  //   const promises = [...this.connections.values()].map(
  //     (connection: Connection) => connection.socket.disconnect()
  //   );
  //   await Promise.all(promises);
  //   this.connections.clear();
  // }
}
