import request from 'supertest';
import express from 'express';
import fileStore from '../fileStore';
import path from 'path';
import fs from 'fs';
import tempy from 'tempy';
import aws from 'aws-sdk';
import {
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  S3_ENDPOINT,
  S3_BUCKET,
} from '../settings';

jest.mock('nanoid', () => {
  let count = 0;
  return {
    nanoid: jest.fn(() => {
      return 'nanoid_' + count++;
    }),
  };
});

describe.each([
  ['memory', { url: '' }],
  ['disk', { url: '', destination: tempy.directory({ prefix: 'test__' }) }],
  [
    's3',
    {
      url: '',
      bucket: S3_BUCKET,
      secretKey: S3_SECRET_KEY,
      accessKey: S3_ACCESS_KEY,
      endpoint: S3_ENDPOINT,
    },
  ],
])('Backend <%s> file store', (backendType, options) => {
  let app;
  let query;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(fileStore(backendType, options));
    query = request(app);
  });

  afterAll(() => {
    // Clean files
    if (options.destination) {
      try {
        fs.rmdirSync(options.destination, { recursive: true });
      } catch (e) {
        console.log(e);
      }
    }
    // Clean bucket
    if (options.bucket) {
      const { bucket, secretKey, accessKey, endpoint } = options;

      aws.config.update({
        secretAccessKey: secretKey,
        accessKeyId: accessKey,
        endpoint: endpoint,
      });

      const s3 = new aws.S3();

      const params = {
        Bucket: bucket,
      };

      s3.listObjects(params, (err, data) => {
        const deleteParams = {
          Bucket: bucket,
          Delete: { Objects: data.Contents.map(({ Key }) => ({ Key })) },
        };
        s3.deleteObjects(deleteParams, (err, deleteData) => {});
      });
    }
  });

  it('should store file', async () => {
    const boxId = 'box010';
    const res = await query
      .post(`/file/${boxId}/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(200);

    expect(res.text).toEqual(expect.stringContaining(`/file/${boxId}/nanoid_`));
  });

  it('should retreive image file', async () => {
    const boxId = 'box020';
    const res = await query
      .post(`/file/${boxId}/`)
      .attach('file', path.resolve(__dirname, 'test.png'))
      .expect(200);

    const fileUrl = res.text;

    const fileRes = await query.get(fileUrl).buffer(false).expect(200);

    expect(fileRes.type).toBe('image/png');
    expect(fileRes.body.length).toBe(6174);
  });

  it('should retreive text file', async () => {
    const boxId = 'box025';
    const res = await query
      .post(`/file/${boxId}/`)
      .set('Content-Type', 'text/plain')
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(200);

    const fileUrl = res.text;

    const fileRes = await query.get(fileUrl).buffer(false).expect(200);

    expect(fileRes.type).toBe('text/plain');
    // Fixme
  });

  it('should list files', async () => {
    const boxId = 'box030';
    const res = await query
      .post(`/file/${boxId}/`)
      .attach('file', path.resolve(__dirname, 'testFile.txt'))
      .expect(200);

    const res2 = await query
      .post(`/file/${boxId}/`)
      .attach('file', path.resolve(__dirname, 'test.png'))
      .expect(200);

    const fileList = await query.get(`/file/${boxId}/`).expect(200);

    expect(Array.isArray(fileList.body)).toBe(true);
    expect(fileList.body.length).toBe(2);
    expect(fileList.body[0]).toEqual(
      expect.stringContaining(`/file/${boxId}/nanoid_`)
    );
  });

  it('should delete file', async () => {
    const boxId = 'box040';
    const res = await query
      .post(`/file/${boxId}/`)
      .attach('file', path.resolve(__dirname, 'test.png'))
      .expect(200);

    const fileUrl = res.text;

    await query.delete(fileUrl).buffer(false).expect(200);

    const fileList = await query.get(`/file/${boxId}/`).expect(200);
    expect(fileList.body.length).toBe(0);
  });
});
