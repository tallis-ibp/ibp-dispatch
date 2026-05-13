import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requestHandler } from '../src/server/handler.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  return requestHandler(req, res);
}
