import express, {
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from 'express';
import { parse, type InitData } from '@tma.js/init-data-node';

/**
 * Sets init data in the specified Response object.
 * @param res - Response object.
 * @param initData - init data.
 */
export function setInitData(res: Response, initData: InitData): void {
  res.locals.initData = initData;
}

/**
 * Extracts init data from the Response object.
 * @param res - Response object.
 * @returns Init data stored in the Response object. Can return undefined in case,
 * the client is not authorized.
 */
export function getInitData(res: Response): InitData | undefined {
  return res.locals.initData;
}