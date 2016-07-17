# gRPC to GraphQL Adapter

* adapts a gRPC API and provides the methods as a GraphQL API
* you have to provide a proto file inside the docker container which describes the service to adapt (default full name of the proto file is ```/api/main.proto```)
* build docker container with ```docker build -t <containerName> <pathToDockerfile>```
* run docker container with ```docker run -p 40022:40022 <containerName>```
* to connect to a running gRPC server, you have to set at least the environment variables API_HOST and API_PORT in the Dockerfile (IP and port of the host running the gRPC service)
