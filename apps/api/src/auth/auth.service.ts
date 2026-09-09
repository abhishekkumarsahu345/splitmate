import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import mongoose, { Model } from 'mongoose';
import { Response } from 'express';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema.js';
import { UsersService } from '../users/users.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const rounds = parseInt(this.configService.get<string>('BCRYPT_ROUNDS', '11'), 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.usersService.create(dto.email, dto.name, passwordHash);

    return {
      id: (user._id as object).toString(),
      email: user.email,
      name: user.name,
    };
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid email or password');

    const userId = (user._id as object).toString();
    const accessToken = this.jwtService.sign({ sub: userId, email: user.email });

    const { rawToken, tokenHash } = this.generateRefreshToken();
    await this.persistRefreshToken(userId, tokenHash);
    this.setRefreshCookie(res, rawToken);

    return { accessToken, id: userId, email: user.email };
  }

  async refresh(refreshTokenCookie: string, res: Response) {
    if (!refreshTokenCookie) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokenHash = this.hashToken(refreshTokenCookie);

    const storedToken = await this.refreshTokenModel
      .findOne({ tokenHash, revokedAt: null })
      .exec();

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // Token not found or expired — revoke all tokens for this user if we can identify them
      if (storedToken) {
        await this.refreshTokenModel.updateMany(
          { userId: storedToken.userId, revokedAt: null },
          { revokedAt: new Date() },
        );
      }
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke current token (rotation)
    storedToken.revokedAt = new Date();
    await storedToken.save();

    const userId = storedToken.userId.toString();
    const user = await this.usersService.findById(userId);
    if (!user) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    const accessToken = this.jwtService.sign({ sub: userId, email: user.email });

    const { rawToken, tokenHash: newHash } = this.generateRefreshToken();
    await this.persistRefreshToken(userId, newHash);
    this.setRefreshCookie(res, rawToken);

    return { accessToken };
  }

  async logout(userId: string, res: Response) {
    await this.refreshTokenModel.deleteMany({ userId }).exec();
    this.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private generateRefreshToken(): { rawToken: string; tokenHash: string } {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async persistRefreshToken(userId: string, tokenHash: string): Promise<void> {
    const days = parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_DAYS', '30'),
      10,
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.refreshTokenModel.create({ userId, tokenHash, expiresAt, revokedAt: null });
  }

  private setRefreshCookie(res: Response, token: string): void {
    const days = parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_DAYS', '30'),
      10,
    );
    // sameSite must be 'none' in production because Vercel (frontend) and
    // Render (backend) are on different domains. 'none' requires secure:true.
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: isProd ? 'none' : 'strict',
      maxAge: days * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response): void {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: true,
      sameSite: isProd ? 'none' : 'strict',
      path: '/',
    });
  }
}
