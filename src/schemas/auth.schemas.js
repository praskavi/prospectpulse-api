import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email({ message: 'Email must be valid' }),
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  }),
});

export const signupSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    email: z.string().email({ message: 'Email must be valid' }),
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email({ message: 'Email must be valid' }),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    accessToken: z.string().min(1, { message: 'Password reset token is required' }),
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  }),
});
