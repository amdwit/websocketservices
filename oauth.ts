import fetch from 'node-fetch';
import * as io from 'socket.io';
import { ServerMiddleware } from './DataServer';

export default (config:any):ServerMiddleware => {
  const authorized: Map<string, boolean> = new Map();
  return async (socket:io.Socket, next:( err?: any ) => void) => {
    console.log('authorization', socket.request.query);
    const code = socket.request._query.code;
    if (authorized.get(code)) {
      next();
    } else {
      const body = {
        code: code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: config.redirect_uri,
        grant_type: 'authorization_code',
      };
      // const body = `code=${(req.query.code)}&client_id=${(config.oauth!.client_id)}&client_secret=${(config.oauth!.client_secret)}&redirect_uri=${(config.oauth!.redirect_uri)}&grant_type=authorization_code`

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const json = await response.json();
      console.log('token', json);

      const response2 = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${json.id_token}`,
        {
          method: 'GET',
        },
      );
      const json2 = await response2.json();
      console.log('tokeninfo', json2);

      if (json2.sub === config.sub) {
        authorized.set(code, true);
        next();
      } else {
        next(new Error('Not authenticated!'));
      }
    }
  };
}
