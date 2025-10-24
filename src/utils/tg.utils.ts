import express, {
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from 'express';

// /**
//  * Sets init data in the specified Response object.
//  * @param res - Response object.
//  * @param initData - init data.
//  */
// function setInitData(res: Response, initData: InitData): void {
//   res.locals.initData = initData;
// }

// /**
//  * Extracts init data from the Response object.
//  * @param res - Response object.
//  * @returns Init data stored in the Response object. Can return undefined in case,
//  * the client is not authorized.
//  */
// function getInitData(res: Response): InitData | undefined {
//   return res.locals.initData;
// }