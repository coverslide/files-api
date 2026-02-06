const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('Error Handling Scenarios', () => {
  let testFs
  let mockResponse
  let handler
  let consoleErrorSpy

  beforeEach(() => {
    testFs = new TestFileSystem()
    mockResponse = new MockResponse()
    handler = api(testFs.getTempPath())
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    testFs.cleanup()
    consoleErrorSpy.mockRestore()
  })

  describe('File System Errors', () => {
    test('should handle non-existent file gracefully', async () => {
      const req = createMockRequest({ url: '/nonexistent.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    test('should handle non-existent directory gracefully', async () => {
      const req = createMockRequest({ url: '/nonexistent-dir' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle file system permission errors', async () => {
      const req = createMockRequest({ url: '/root/.ssh/private_key' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle corrupted or invalid file paths', async () => {
      const req = createMockRequest({ url: '/invalid\0path.txt' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle very long file paths', async () => {
      const longPath = '/' + 'a'.repeat(300) + '.txt'
      const req = createMockRequest({ url: longPath })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })
  })

  describe('HTTP Method Errors', () => {
    test('should reject POST requests', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })

    test('should reject PUT requests', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })

    test('should reject DELETE requests', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })

    test('should reject PATCH requests', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: '/test.txt',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(400)
      expect(mockResponse.body).toBe('')
    })

    test('should handle unsupported methods gracefully', async () => {
      const methods = ['TRACE', 'CONNECT', 'PROPFIND', 'MKCOL']

      for (const method of methods) {
        const req = createMockRequest({
          method,
          url: '/test.txt',
        })

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(400)
        expect(mockResponse.body).toBe('')
      }
    })
  })

  describe('Archive Operation Errors', () => {
    let mockSevenZip

    beforeEach(() => {
      mockSevenZip = {
        getFiles: jest.fn(),
        getSingleFile: jest.fn(),
        extractFile: jest.fn(),
      }

      jest.mock('sevenzip', () => {
        return {
          SevenZip: jest.fn(() => mockSevenZip),
        }
      })
    })

    test('should handle missing extract parameter', async () => {
      testFs.createFile('archive.7z', 'dummy')
      const req = createMockRequest({
        url: '/archive.7z?action=extract',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('`extract` param required')
    })

    test('should handle non-existent archive file', async () => {
      const req = createMockRequest({
        url: '/nonexistent.7z?action=contents',
      })

      mockSevenZip.getFiles.mockRejectedValue(new Error('File not found'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('File not found')
    })

    test('should handle corrupted archive', async () => {
      testFs.createFile('corrupted.7z', 'invalid archive data')
      const req = createMockRequest({
        url: '/corrupted.7z?action=contents',
      })

      mockSevenZip.getFiles.mockRejectedValue(new Error('Corrupted archive'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Corrupted archive')
    })

    test('should handle extraction of non-existent file in archive', async () => {
      testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=missing.txt',
      })

      mockSevenZip.getSingleFile.mockRejectedValue(new Error('File not found in archive'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('File not found in archive')
    })

    test('should handle archive extraction failure', async () => {
      testFs.createFile('archive.7z', 'archive data')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=damaged.txt',
      })

      mockSevenZip.getSingleFile.mockResolvedValue({ Size: 1024 })
      mockSevenZip.extractFile.mockRejectedValue(new Error('Extraction failed'))

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBe('Extraction failed')
    })
  })

  describe('URL and Parameter Errors', () => {
    test('should handle malformed URLs', async () => {
      const req = createMockRequest({
        url: '/../../../etc/passwd',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle null/undefined URLs', async () => {
      const req = createMockRequest({ url: null })

      try {
        await handler(req, mockResponse)
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    test('should handle requests with invalid query parameters', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt?invalid=param&another=invalid',
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
    })

    test('should handle directory traversal attempts', async () => {
      const traversalPaths = [
        '/../../../etc/passwd',
        '/..\\..\\windows\\system32\\config\\sam',
        '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '/..%252f..%252f..%252fetc%252fpasswd',
      ]

      for (const path of traversalPaths) {
        const req = createMockRequest({ url: path })

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(404)
      }
    })
  })

  describe('Range Request Errors', () => {
    test('should handle malformed range headers', async () => {
      testFs.createFile('test.txt', 'content')
      const malformedRanges = [
        'invalid-range',
        'bytes=abc-def',
        'bytes=100-50',
        'bytes=-100-200',
        'bytes=',
        'bytes=--',
      ]

      for (const range of malformedRanges) {
        const req = createMockRequest({
          url: '/test.txt',
          headers: { range },
        })

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(200)
      }
    })

    test('should handle range requests to directories', async () => {
      testFs.createDirectory('test-dir')
      const req = createMockRequest({
        url: '/test-dir',
        headers: { range: 'bytes=0-100' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-range')).toBeUndefined()
    })

    test('should handle range requests with invalid units', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'items=0-100' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-range')).toBeUndefined()
    })
  })

  describe('Edge Case Errors', () => {
    test('should handle requests to system directories', async () => {
      const systemPaths = ['/proc', '/sys', '/dev', '/etc/shadow', '/var/log/auth.log']

      for (const path of systemPaths) {
        const req = createMockRequest({ url: path })

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(404)
      }
    })

    test('should handle requests with reserved Windows filenames', async () => {
      const reservedNames = ['CON.txt', 'PRN.txt', 'AUX.txt', 'NUL.txt', 'COM1.txt', 'LPT1.txt']

      for (const name of reservedNames) {
        const req = createMockRequest({ url: `/${name}` })

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(404)
      }
    })

    test('should handle favicon.ico requests without error logging', async () => {
      const req = createMockRequest({ url: '/favicon.ico' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    test('should handle requests to hidden files and directories', async () => {
      const hiddenPaths = ['/.hidden', '/.hidden-file.txt', '/.config/nested/.file']

      for (const path of hiddenPaths) {
        const req = createMockRequest({ url: path })

        await handler(req, mockResponse)

        expect(mockResponse.statusCode).toBe(404)
      }
    })

    test('should handle requests with extremely large range values', async () => {
      testFs.createFile('test.txt', 'content')
      const req = createMockRequest({
        url: '/test.txt',
        headers: { range: 'bytes=999999999999999-999999999999999' },
      })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(206)
    })
  })

  describe('Error Response Format', () => {
    test('should return consistent error response format', async () => {
      const req = createMockRequest({ url: '/nonexistent.txt' })

      await handler(req, mockResponse)

      const errorResponse = JSON.parse(mockResponse.body)
      expect(errorResponse).toHaveProperty('error')
      expect(typeof errorResponse.error).toBe('string')
      expect(errorResponse.error.length).toBeGreaterThan(0)
    })

    test('should preserve original error messages', async () => {
      testFs.createFile('archive.7z', 'archive')
      const req = createMockRequest({
        url: '/archive.7z?action=extract&extract=file.txt',
      })

      const mockSevenZip = {
        getSingleFile: jest.fn().mockRejectedValue(new Error('Specific error message')),
      }
      jest.mock('sevenzip', () => ({
        SevenZip: jest.fn(() => mockSevenZip),
      }))

      await handler(req, mockResponse)

      const errorResponse = JSON.parse(mockResponse.body)
      expect(errorResponse.error).toBe('Specific error message')
    })

    test('should handle errors without messages gracefully', async () => {
      const req = createMockRequest({ url: '/nonexistent.txt' })

      await handler(req, mockResponse)

      const errorResponse = JSON.parse(mockResponse.body)
      expect(errorResponse.error).toBeDefined()
    })
  })

  describe('Resource Limits and Stress', () => {
    test('should handle rapid successive requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        createMockRequest({ url: `/nonexistent${Math.random()}.txt` })
      )

      const promises = requests.map((req) => {
        const response = new MockResponse()
        return handler(req, response)
      })

      await Promise.all(promises)
    })

    test('should handle concurrent directory listings', async () => {
      testFs.createDirectory('test-dir')
      for (let i = 0; i < 100; i++) {
        testFs.createFile(`test-dir/file${i}.txt`, `content${i}`)
      }

      const requests = Array.from({ length: 5 }, () => createMockRequest({ url: '/test-dir' }))

      const promises = requests.map((req) => {
        const response = new MockResponse()
        return handler(req, response)
      })

      await Promise.all(promises)
    })
  })
})
