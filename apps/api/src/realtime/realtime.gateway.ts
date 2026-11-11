import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  type JobProgressPayload,
} from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ??
          undefined);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
      });

      const room = this.userRoom(payload.sub);
      await client.join(room);
      client.data.userId = payload.sub;
      this.logger.debug(`Client joined ${room}`);
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  emitJobProgress(userId: string, payload: JobProgressPayload): void {
    this.server
      .to(this.userRoom(userId))
      .emit(SOCKET_EVENTS.JOB_PROGRESS, payload);
  }

  emitJobCompleted(userId: string, payload: JobProgressPayload): void {
    this.server
      .to(this.userRoom(userId))
      .emit(SOCKET_EVENTS.JOB_COMPLETED, payload);
  }

  emitJobFailed(userId: string, payload: JobProgressPayload): void {
    this.server
      .to(this.userRoom(userId))
      .emit(SOCKET_EVENTS.JOB_FAILED, payload);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
