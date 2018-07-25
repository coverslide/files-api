# vim:noet
build:
	docker build . -t coverslide/files-api

publish:
	docker push coverslide/files-api
