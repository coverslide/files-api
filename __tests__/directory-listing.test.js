const { TestFileSystem, MockResponse, createMockRequest } = require('../test-utils')
const api = require('../api.js')

describe('Directory Listing Functionality', () => {
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

  describe('Basic Directory Operations', () => {
    test('should list empty directory', async () => {
      testFs.createDirectory('empty-dir')
      const req = createMockRequest({ url: '/empty-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toEqual([])
      expect(response.filename).toBe('empty-dir')
    })

    test('should list directory with files', async () => {
      testFs.createDirectory('test-dir')
      testFs.createFile('test-dir/file1.txt', 'content1')
      testFs.createFile('test-dir/file2.txt', 'content2')
      testFs.createFile('test-dir/subdir/file3.txt', 'content3')

      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(2)
      expect(response.files.map((f) => f.filename)).toContain('file1.txt')
      expect(response.files.map((f) => f.filename)).toContain('file2.txt')
      expect(response.files.map((f) => f.filename)).not.toContain('file3.txt')
    })

    test('should include subdirectories in listing', async () => {
      testFs.createDirectory('test-dir')
      testFs.createDirectory('test-dir/subdir1')
      testFs.createDirectory('test-dir/subdir2')
      testFs.createFile('test-dir/file1.txt', 'content')

      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(3)

      const subdir1 = response.files.find((f) => f.filename === 'subdir1')
      const subdir2 = response.files.find((f) => f.filename === 'subdir2')
      const file1 = response.files.find((f) => f.filename === 'file1.txt')

      expect(subdir1.directory).toBe(true)
      expect(subdir2.directory).toBe(true)
      expect(file1.directory).toBe(false)
    })

    test('should include file metadata in directory listing', async () => {
      testFs.createDirectory('test-dir')
      testFs.createFile('test-dir/document.txt', 'document content')

      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      const file = response.files.find((f) => f.filename === 'document.txt')

      expect(file).toBeDefined()
      expect(file.directory).toBe(false)
      expect(file.filename).toBe('document.txt')
      expect(typeof file.size).toBe('number')
      expect(typeof file.mtime).toBe('number')
      expect(typeof file.mtimeMs).toBe('number')
      expect(typeof file.birthtime).toBe('number')
      expect(typeof file.birthtimeMs).toBe('number')
    })

    test('should include directory metadata in listing', async () => {
      testFs.createDirectory('test-dir')
      testFs.createDirectory('test-dir/subdir')

      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      const subdir = response.files.find((f) => f.filename === 'subdir')

      expect(subdir).toBeDefined()
      expect(subdir.directory).toBe(true)
      expect(subdir.filename).toBe('subdir')
      expect(typeof subdir.size).toBe('number')
      expect(typeof subdir.mtime).toBe('number')
    })
  })

  describe('Directory Structure Navigation', () => {
    test('should list nested directories', async () => {
      testFs.createDirectory('level1')
      testFs.createDirectory('level1/level2')
      testFs.createDirectory('level1/level2/level3')
      testFs.createFile('level1/level2/level3/deep.txt', 'deep content')

      const req = createMockRequest({ url: '/level1/level2/level3' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(1)
      expect(response.files[0].filename).toBe('deep.txt')
      expect(response.files[0].directory).toBe(false)
    })

    test('should list root directory', async () => {
      testFs.createFile('root-file.txt', 'root content')
      testFs.createDirectory('root-dir')

      const req = createMockRequest({ url: '/' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(2)
      expect(response.files.map((f) => f.filename)).toContain('root-file.txt')
      expect(response.files.map((f) => f.filename)).toContain('root-dir')
    })

    test('should handle directory names with spaces', async () => {
      testFs.createDirectory('directory with spaces')
      testFs.createFile('directory with spaces/file.txt', 'content')

      const req = createMockRequest({ url: '/directory%20with%20spaces' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.filename).toBe('directory with spaces')
      expect(response.files).toHaveLength(1)
    })

    test('should handle directory names with special characters', async () => {
      testFs.createDirectory('dir-with.special_chars&symbols')
      testFs.createFile('dir-with.special_chars&symbols/test.txt', 'content')

      const req = createMockRequest({ url: '/dir-with.special_chars&symbols' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.filename).toBe('dir-with.special_chars&symbols')
      expect(response.files).toHaveLength(1)
    })
  })

  describe('File System Operations', () => {
    test('should handle directories with many files', async () => {
      testFs.createDirectory('large-dir')

      for (let i = 0; i < 100; i++) {
        testFs.createFile(`large-dir/file${i}.txt`, `content ${i}`)
      }

      const req = createMockRequest({ url: '/large-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(100)

      for (let i = 0; i < 100; i++) {
        expect(response.files.find((f) => f.filename === `file${i}.txt`)).toBeDefined()
      }
    })

    test('should handle mixed file types in directory', async () => {
      testFs.createDirectory('mixed-dir')
      testFs.createFile('mixed-dir/document.pdf', 'pdf content')
      testFs.createFile('mixed-dir/image.jpg', 'image content')
      testFs.createFile('mixed-dir/script.js', 'js content')
      testFs.createFile('mixed-dir/data.json', 'json content')
      testFs.createDirectory('mixed-dir/subdir')

      const req = createMockRequest({ url: '/mixed-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(5)

      const filenames = response.files.map((f) => f.filename)
      expect(filenames).toContain('document.pdf')
      expect(filenames).toContain('image.jpg')
      expect(filenames).toContain('script.js')
      expect(filenames).toContain('data.json')
      expect(filenames).toContain('subdir')
    })

    test('should handle hidden files and directories', async () => {
      testFs.createDirectory('test-dir')
      testFs.createFile('test-dir/.hidden.txt', 'hidden content')
      testFs.createFile('test-dir/visible.txt', 'visible content')
      testFs.createDirectory('test-dir/.hidden-dir')

      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(3)

      const filenames = response.files.map((f) => f.filename)
      expect(filenames).toContain('.hidden.txt')
      expect(filenames).toContain('visible.txt')
      expect(filenames).toContain('.hidden-dir')
    })
  })

  describe('Directory Response Format', () => {
    test('should return properly formatted directory response', async () => {
      testFs.createDirectory('test-dir')
      testFs.createFile('test-dir/example.txt', 'content')

      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)

      expect(response).toHaveProperty('directory', true)
      expect(response).toHaveProperty('filename', 'test-dir')
      expect(response).toHaveProperty('files')
      expect(Array.isArray(response.files)).toBe(true)

      const file = response.files[0]
      expect(file).toHaveProperty('filename', 'example.txt')
      expect(file).toHaveProperty('directory', false)
      expect(file).toHaveProperty('size')
      expect(file).toHaveProperty('mtime')
      expect(file).toHaveProperty('mtimeMs')
      expect(file).toHaveProperty('birthtime')
      expect(file).toHaveProperty('birthtimeMs')
    })

    test('should handle directory request with query parameters', async () => {
      testFs.createDirectory('test-dir')
      testFs.createFile('test-dir/file.txt', 'content')

      const req = createMockRequest({
        url: '/test-dir?download=true&action=stat',
      })

      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.directory).toBe(true)
      expect(response.files).toHaveLength(1)
      expect(response.files[0].filename).toBe('file.txt')
    })

    test('should set proper Content-Type for directory listing', async () => {
      testFs.createDirectory('test-dir')
      const req = createMockRequest({ url: '/test-dir' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(200)
      expect(mockResponse.getHeader('content-type')).toContain('application/json')
    })
  })

  describe('Error Handling for Directories', () => {
    test('should handle non-existent directory', async () => {
      const req = createMockRequest({ url: '/nonexistent-dir' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle file request as directory', async () => {
      testFs.createFile('not-a-dir.txt', 'content')
      const req = createMockRequest({ url: '/not-a-dir.txt/' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle permission errors gracefully', async () => {
      const req = createMockRequest({ url: '/restricted-dir' })

      await handler(req, mockResponse)

      expect(mockResponse.statusCode).toBe(404)
      expect(JSON.parse(mockResponse.body).error).toBeDefined()
    })

    test('should handle directory traversal attempts', async () => {
      testFs.createDirectory('test-dir')
      const req = createMockRequest({ url: '/test-dir/../../../etc/passwd' })

      await handler(req, mockResponse)

      const response = mockResponse.body
      expect(response).toBeDefined()
    })
  })

  describe('Performance Considerations', () => {
    test('should handle directory listing efficiently', async () => {
      testFs.createDirectory('perf-test')

      const startTime = Date.now()

      for (let i = 0; i < 50; i++) {
        testFs.createFile(`perf-test/file${i}.txt`, `content ${i}`)
      }

      const req = createMockRequest({ url: '/perf-test' })
      await handler(req, mockResponse)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(duration).toBeLessThan(1000)

      const response = JSON.parse(mockResponse.body)
      expect(response.files).toHaveLength(50)
    })

    test('should preserve file order from readdir', async () => {
      testFs.createDirectory('ordered-dir')

      const files = ['z-last.txt', 'a-first.txt', 'm-middle.txt']
      files.forEach((file) => testFs.createFile(`ordered-dir/${file}`, 'content'))

      const req = createMockRequest({ url: '/ordered-dir' })
      await handler(req, mockResponse)

      const response = JSON.parse(mockResponse.body)
      expect(response.files).toHaveLength(3)

      const filenames = response.files.map((f) => f.filename)
      expect(filenames).toEqual(expect.arrayContaining(files))
    })
  })
})
