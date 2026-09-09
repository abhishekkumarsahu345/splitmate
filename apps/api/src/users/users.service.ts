import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema.js';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(email: string, name: string, passwordHash: string): Promise<UserDocument> {
    return this.userModel.create({ email, name, passwordHash });
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async searchByEmail(query: string): Promise<{ _id: string; name: string; email: string }[]> {
    if (!query || query.trim().length < 2) return [];
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await this.userModel
      .find({
        $or: [
          { email: { $regex: escaped, $options: 'i' } },
          { name: { $regex: escaped, $options: 'i' } },
        ],
      })
      .select('name email')
      .limit(10)
      .lean()
      .exec();
    // Never return passwordHash — using .select() ensures it's excluded
    return users as any;
  }
}
