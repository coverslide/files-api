const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const fs = require('fs')
const api = require('../api.js')

describe('Range Request Stream Creation (Regular Files)', () => {
  let testFs
  let mockResponse
  let handler

  beforeEach(() => {
    testFs = new TestFileSystem()
    mockResponse = new MockResponse()
    handler = api(testFs.getTempPath())
  })

  afterEach(() => {
    testFs.cleanup()
  })

  describe('Stream Creation for Regular Files', () => {
    test('should create readable stream for full file without range', async () => {
      const content = 'Hello, World! This is test content.'
      testFs.createFile('test.txt', content)
      const req = createMockRequest({ url: '/test.txt' })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 0,
        end: Infinity,
      })
      expect(mockResponse.statusCode).toBe(200)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create readable stream with correct start and end for range', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=100-299' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 100,
        end: 299,
      })
      expect(mockResponse.statusCode).toBe(206)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create stream with start-only range (suffix)', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=500-' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 500,
        end: 999,
      })
      expect(mockResponse.statusCode).toBe(206)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create stream for range that goes to end of file', async () => {
      testFs.createLargeFile('test.txt', 100)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=80-' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 80,
        end: 99,
      })
      expect(mockResponse.statusCode).toBe(206)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create stream for single byte range', async () => {
      testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=42-42' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 42,
        end: 42,
      })
      expect(mockResponse.statusCode).toBe(206)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should handle zero-byte file with range request', async () => {
      testFs.createFile('empty.txt', '')
      const req = createMockRequest({
        url: '/empty.txt',
        headers: { range: 'bytes=0-0' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('empty.txt'), {
        start: 0,
        end: 0,
      })
      expect(mockResponse.statusCode).toBe(206)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create stream even when range exceeds file size', async () => {
      testFs.createLargeFile('small.txt', 100)
      const req = createMockRequest({
        url: '/small.txt',
        headers: { range: 'bytes=50-200' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('small.txt'), {
        start: 50,
        end: 200,
      })
      expect(mockResponse.statusCode).toBe(206)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should not create stream for HEAD requests', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        method: 'HEAD',
        url: '/test.txt',
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).not.toHaveBeenCalled()
      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.body).toBe('')

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should not create stream for OPTIONS requests', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        method: 'OPTIONS',
        url: '/test.txt',
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).not.toHaveBeenCalled()
      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.body).toBe('')

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create stream for files with spaces in name', async () => {
      testFs.createFile('file with spaces.txt', 'content')
      const req = createMockRequest({
        url: '/file%20with%20spaces.txt',
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(
        expect.stringContaining('file with spaces.txt'),
        { start: 0, end: Infinity }
      )
      expect(mockResponse.statusCode).toBe(200)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create stream for files in subdirectories', async () => {
      testFs.createDirectory('subdir')
      testFs.createFile('subdir/nested.txt', 'nested content')
      const req = createMockRequest({
        url: '/subdir/nested.txt',
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(
        expect.stringContaining(path.join('subdir', 'nested.txt')),
        { start: 0, end: Infinity }
      )
      expect(mockResponse.statusCode).toBe(200)

      fsCreateReadStreamSpy.mockRestore()
    })
  })

  describe('Stream Behavior Verification', () => {
    test('should return a stream that can be piped', async () => {
      testFs.createFile('test.txt', 'test content')
      const req = createMockRequest({ url: '/test.txt' })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn(),
      }
      fsCreateReadStreamSpy.mockReturnValue(mockStream)

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalled()
      expect(mockStream.pipe).toHaveBeenCalledWith(mockResponse)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should handle stream creation errors gracefully', async () => {
      const req = createMockRequest({ url: '/nonexistent.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })
  })

  describe('Invalid Range Handling', () => {
    test('should ignore invalid range unit and create full stream', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'items=0-100' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 0,
        end: Infinity,
      })
      expect(mockResponse.statusCode).toBe(200)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should ignore malformed range header', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'invalid-range-format' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 0,
        end: Infinity,
      })
      expect(mockResponse.statusCode).toBe(200)

      fsCreateReadStreamSpy.mockRestore()
    })

    test('should create full stream when range regex fails to match', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=' },
      })

      const fsCreateReadStreamSpy = jest.spyOn(fs, 'createReadStream')

      await handler(req, mockResponse)

      expect(fsCreateReadStreamSpy).toHaveBeenCalledWith(expect.stringContaining('test.txt'), {
        start: 0,
        end: Infinity,
      })
      expect(mockResponse.statusCode).toBe(200)

      fsCreateReadStreamSpy.mockRestore()
    })
  })
})
