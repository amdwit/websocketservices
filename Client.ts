import { action, observable } from "mobx";
import * as io from "socket.io-client";
import { Jsoncoder } from "../jsoncoder";
import { seconds, tryForSomePeriod } from "../Moment";
import { ServiceMap } from './common';
import Socket = SocketIOClient.Socket;

export default class Client<ClientServiceNames extends string, ServerServiceNames extends string> {
  public serverServiceMap!: ServiceMap<ServerServiceNames>;
  @observable connected?: boolean;
  public socket: Socket | null = null;
  private handleIncomingEvents = true;
  private jsonCoder = new Jsoncoder(new Map(), {});

  constructor(public uri:string, public clientServiceMap: ServiceMap<ClientServiceNames>, public oAuthCode: string) {
    this.clientServiceMap = clientServiceMap;
    this.serverServiceMap = new Proxy<ServiceMap<ServerServiceNames>>(
      {} as ServiceMap<ServerServiceNames>,
      {
        get: (t, key: ServerServiceNames) => (...args: any[]) =>
          this.emit<any>(key, ...args)
      }
    );
  }

  public disconnect() {
    this.socket && this.socket.close();
    this.socket = null;
  }

  public async connect() {
    const socket = io(this.uri, {
      autoConnect: false,
      query: { code: this.oAuthCode }
    });
    socket.on("service", async (name: ClientServiceNames, data: string) => {
      try {
        const service = this.clientServiceMap[name];
        if (this.handleIncomingEvents) {
          const args = this.jsonCoder.parse(data);
          service(...args);
        }
      } catch (error) {
        console.error("parse error: ", error.constructor.name, error.message);
      }
    });

    for (const event of "connect connect_error connect_timeout connecting disconnect error reconnect reconnect_attempt reconnect_failed reconnect_error reconnecting ping pong".split(
      " "
    )) {
      socket.on(event, async (...args: []) => {
        console.info("socket event:", event, args);
      });
    }
    socket.on(
      "reconnect",
      action(async () => {
        this.connected = true;
      })
    );
    socket.on(
      "connect",
      action(async () => {
        this.connected = true;
      })
    );
    socket.on(
      "disconnect",
      action(async () => {
        this.connected = false;
      })
    );
    socket.open();
    await tryForSomePeriod(
      () => (socket.connected ? Promise.resolve() : Promise.reject()),
      { period: seconds(5), interval: seconds(0.1) }
    );
    this.socket = socket;
  }

  public async emit<T>(
    event: ServerServiceNames,
    ...args: any[]
  ): Promise<T> {
    await tryForSomePeriod(() => {
      return new Promise((resolve, reject) => {
        this.socket && this.socket.connected ? resolve() : reject();
      });
    });
    return new Promise<T>((resolve, reject): void => {
      this.socket &&
        this.socket.emit(
          "service",
          event,
          this.jsonCoder.stringify(args),
          (raw: string) => {
            const response=this.jsonCoder.parse<T>(raw)
            if (response instanceof Error) {
              reject(response);
            } else {
              resolve(response);
            }
          }
        );
    });
  }
}
