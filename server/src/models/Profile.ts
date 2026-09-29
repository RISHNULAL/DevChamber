import mongoose, { Schema } from 'mongoose';

export interface IProfile {
  _id: string;
  userId: string;
  fullName: string;
  role: 'teacher' | 'student' | 'admin';
  email?: string;
  avatarColor?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProfileSchema = new Schema<IProfile>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: ['teacher', 'student', 'admin'], default: 'student' },
    email: { type: String, lowercase: true, trim: true },
    avatarColor: { type: String, default: 'blue' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.full_name = ret.fullName;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Profile = mongoose.models.Profile || mongoose.model<IProfile>('Profile', ProfileSchema, 'profiles');
