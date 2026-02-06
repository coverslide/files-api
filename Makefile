.PHONY: build publish lint format test

build:
	docker build . -t coverslide/files-api

publish:
	docker push coverslide/files-api

lint:
	npm run lint

format:
	npm run format

test:
	npm test

dev:
	npm run dev
