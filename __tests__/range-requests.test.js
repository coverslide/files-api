const { TestFileSystem, MockResponse, MockSevenZip, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('Range Request Header Parsing', () => {
  let testFs
  let mockSevenZip
  let mockResponse
  let handler

  beforeEach(() => {
    testFs = new TestFileSystem()
    mockSevenZip = new MockSevenZip()
    mockResponse = new MockResponse()
    handler = api(testFs.getTempPath())
  })

  afterEach(() => {
    testFs.cleanup()
  })

  describe('Regular File Range Requests', () => {
    test('should parse valid range header with start and end', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=100-299' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 100-299/1000')
      expect(mockResponse.getHeader('content-length')).toBe('200')
    })

    test('should parse range header with start only', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=500-' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 500-999/1000')
      expect(mockResponse.getHeader('content-length')).toBe('500')
    })

    test('should ignore non-bytes range unit', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'items=100-299' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-range')).toBeUndefined()
    })

    test('should handle malformed range header gracefully', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'invalid-range' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-range')).toBeUndefined()
    })

    test('should handle range beyond file size', async () => {
      const filePath = testFs.createLargeFile('test.txt', 100)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=200-299' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 200-299/100')
      expect(mockResponse.getHeader('content-length')).toBe('0')
    })

    test('should set proper headers when no range header is present', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('accept-ranges')).toBe('bytes')
      expect(mockResponse.getHeader('content-length')).toBe('1000')
      expect(mockResponse.getHeader('content-range')).toBeUndefined()
    })
  })

  describe('Archive File Range Requests', () => {
    beforeEach(() => {
      jest.mock('sevenzip', () => mockSevenZip)
    })

    test('should parse valid range header for archive extraction', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive content')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=100-299' },
      })

      const mockFileStats = { Size: 5000, size: 5000 }
      mockSevenZip.setMockOutput('e', [archivePath, 'large-file.txt'], mockFileStats)

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 100-299/5000')
    })

    test('should use correct size property for archive range calculations', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive content')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
        headers: { range: 'bytes=100-' },
      })

      const mockFileStats = { Size: 5000, size: 5000 }
      mockSevenZip.setMockOutput('e', [archivePath, 'large-file.txt'], mockFileStats)

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
      expect(mockResponse.getHeader('content-range')).toBe('bytes 100-4999/5000')
    })

    test('should handle missing extract parameter', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive content')
      const req = createMockRequest({
        url: '/archive.7z?action=extract',
        headers: { range: 'bytes=100-299' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('`extract` param required')
    })

    test('should set proper headers for archive requests without range', async () => {
      const archivePath = testFs.createFile('archive.7z', 'dummy archive content')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=large-file.txt',
      })

      const mockFileStats = { Size: 5000 }
      mockSevenZip.setMockOutput('e', [archivePath, 'large-file.txt'], mockFileStats)

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('accept-ranges')).toBeUndefined()
      expect(mockResponse.getHeader('content-length')).toBe('5000')
    })
  })

  describe('Range Header Regex Edge Cases', () => {
    test('should handle range header with whitespace', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: ' bytes = 100 - 299 ' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
    })

    test('should handle range header with negative start', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=-100' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
    })

    test('should handle empty range header', async () => {
      const filePath = testFs.createLargeFile('test.txt', 1000)
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: '' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
    })
  })
})
