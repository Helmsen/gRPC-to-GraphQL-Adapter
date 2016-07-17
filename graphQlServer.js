var graphql = require('graphql');
var path = require('path');
var JSFtp = require("jsftp");
var grpcClient = require("./genericGrpcClient");
var apiDescriptionGenerator = require("./apiDescriptionGenerator");

var pathToProtoFile = path.join(__dirname, 'main.proto')
var PORT_GRAPHQL = 50002;
var HOST_GRPC_SERVER = "127.0.0.1";
var PORT_GRPC_SERVER = 50001;
initVariables();
var protoDesc = loadProtoDesc(pathToProtoFile);

apiDescriptionGenerator = new apiDescriptionGenerator(protoDesc, HOST_GRPC_SERVER, PORT_GRPC_SERVER);
grpcClient = new grpcClient(HOST_GRPC_SERVER, PORT_GRPC_SERVER,
	pathToProtoFile, protoDesc);
var cache = {};
cache.files = {};
var graphQlDataTypesIncoming;
var graphQlDataTypesOutgoing;
var graphQlDataTypesConstant = createConstantGraphqlDataTypes();
console.log();
console.log("=======================================================");
console.log("Create GraphQl data types for incoming messages");
graphQlDataTypesIncoming = createGraphqlDataTypes(true);
console.log();
console.log("=======================================================");
console.log("Create GraphQl data types for outgoing messages");
graphQlDataTypesOutgoing = createGraphqlDataTypes(false);
var graphQlSchemaFields = createGraphqlSchemaFields(
	graphQlDataTypesIncoming, graphQlDataTypesOutgoing, graphQlDataTypesConstant);
var graphQlSchema = createGraphqlSchema(graphQlSchemaFields);
var httpServer = startHttpServer().listen(PORT_GRAPHQL);
console.log("");
console.log('GraphQL server listening on '
+ 'http://localhost:' + PORT_GRAPHQL + '/graphql');
console.log('Adapts gRPC server on '
+ HOST_GRPC_SERVER + ":"+ PORT_GRPC_SERVER);



// HTTP SERVER =================================================================
function startHttpServer(){
	var express = require('express');
	var cuid = require('cuid');
  var bodyParser = require("body-parser");

	var httpServer = express();
	httpServer.use(function(req, res, next){
		req.requestId = cuid();
	  next();
	});
	httpServer.use(bodyParser.text({ type: 'application/graphql' }));
	httpServer.get('/graphql/api/md', (req, res) => {
		res.send(apiDescriptionGenerator.getDoc());
	});
	httpServer.get('/graphql/api/html', (req, res) => {
		res.send(apiDescriptionGenerator.getDocForBrowser());
	});
	httpServer.post('/graphql', (req, res) => {
		graphql.graphql(graphQlSchema, req.body, "", req.requestId)
		.then(function(grpcResponse){
			res.send(JSON.stringify(grpcResponse, null, 2));
		});
	});
	return httpServer;
}

function resolveInitialRequest(methodName, serviceName, args, requestId){
	var method = protoDesc.getMethodWithName(methodName);
	cache[requestId] = {};
	downloadFiles(args.input, function(){
		formatByteParameters(args.input);
		grpcClient.callGrpcMethod(serviceName, methodName,
		args.input, cache, requestId);
	});
	console.log(args.input);
	var response = {requestId: requestId};
	console.log("* result: ");
	console.log(response);
	return response;
}

function resolveInitialRequestStreamedInputStart(methodName, serviceName, args, requestId){
	var method = protoDesc.getMethodWithName(methodName);
	cache[requestId] = {};
	downloadFiles(args.input, function(){
		formatByteParameters(args.input);
		grpcClient.callGrpcMethod(serviceName, methodName,
		args.input, cache, requestId);
	});
	var response = {requestId: requestId};
	console.log("* result: ");
	console.log(response);
	return response;
}

function resolveRequestStreamedInputSend(methodName, args){
	downloadFiles(args.input, function(){
		formatByteParameters(args.input);
		grpcClient.streamToGrpcServer(args.input, cache, args.requestId);
	});
	var response = {requestId: args.requestId};
	console.log("* result: ");
	console.log(response);
	return response;
}

function resolveRequestStreamedInputEnd(requestId){
	grpcClient.closeStreamToGrpcServer(cache, requestId);
	var response = {requestId: requestId};
	console.log("* result: ");
	console.log(response);
	return response;
}

	function resolveStatusRequest(args){
	var response = {status: cache[args.input.requestId].status, result: []};
	response.result.push(cache[args.input.requestId].responses[0]);
	cache[args.input.requestId].responses.splice(0,1);
	console.log();
	console.log("Status request");
	console.log("* requestId: " + args.input.requestId);
	console.log("* result: ");
	console.log(response);
	return response;
}

function formatByteParameters(object, objectParent, objectNameInParent){
	if (object == undefined || object == null || !(typeof object === 'object')){
		return;
	}
	for (var property in object) {
		if (object.hasOwnProperty(property)) {
				if (property === "__typeFlagBytes__"){
					objectParent[objectNameInParent] = cache.files[object.id];
				} else {
					formatByteParameters(object[property], object, property);
				}
		}
	}
}

function downloadFiles(methodParams, callback){
	var paramsToDownload = [];
	getParamsToDownload(methodParams, null, null,paramsToDownload);
	if (paramsToDownload.length > 0){
		console.log("");
		console.log("FILES TO DOWNLOAD");
		console.log(paramsToDownload);
		downloadNextFile(paramsToDownload, callback);
	} else {
		callback();
	}
}

function downloadNextFile(paramsToDownload, callback){
	for(var i = 0; i < paramsToDownload.length; i++){
		if (paramsToDownload[i].alreadyDownloaded){
			continue;
		}
		if (i == paramsToDownload.length - 1){
			paramsToDownload[i].alreadyDownloaded = true;
			downloadFile(paramsToDownload[i].host, paramsToDownload[i].port,
			paramsToDownload[i].user, paramsToDownload[i].password,
			paramsToDownload[i].filePath, paramsToDownload[i].id,
			paramsToDownload[i].format, callback);
		} else {
			downloadFile(paramsToDownload[i].host, paramsToDownload[i].port,
			paramsToDownload[i].user, paramsToDownload[i].password,
			paramsToDownload[i].filePath, paramsToDownload[i].id,
			paramsToDownload[i].format, function(){
						paramsToDownload[i].alreadyDownloaded = true;
						downloadNextFile(paramsToDownload, callback);
			});
		}
	}
}

function getParamsToDownload(object, objectParent, objectNameInParent, paramsToDownload){
	if (object == undefined || object == null || !(typeof object === 'object')){
		return;
	}
	for (var property in object) {
    if (object.hasOwnProperty(property)) {
        if (property === "__typeFlagBytes__"){
					object.id = process.hrtime()[1];
					object.alreadyDownloaded = false;
					paramsToDownload.push(object);
				} else {
					getParamsToDownload(object[property], object, property, paramsToDownload);
				}
    }
	}
}

function downloadFile(host, port, user, password, filePathSource, downloadId, format, callback){
	console.log("");
	console.log("FILE DOWNLOAD");
	console.log("* host :" + host);
	console.log("* port:" + port);
	console.log("* user:" + user);
	console.log("* password:" + password);
	console.log("* filePathSrc:" + filePathSource);
	var crypto = require('crypto');
	var md5sum = crypto.createHash('md5');
	var fileNameDest = './FILE_' + md5sum.digest(filePathSource).toString('base64') + process.hrtime()[1];
	console.log("* fileNameDest:" + fileNameDest);
	var Ftp = new JSFtp({
  	host: host,
  	port: port,
  	user: user,
  	pass: password
	});
	Ftp.get(filePathSource, fileNameDest, function(hadErr) {
    if (hadErr){
      console.error('There was an error retrieving the file.');
		}
    else{
      console.log('File copied successfully!');
			fs = require('fs');
			//fs.readFile(fileNameDest, format, function(err, data){
			//});
			var data = fs.readFileSync(fileNameDest);
			cache.files[downloadId] = data;
			if (callback != undefined){
				callback();
			}

		}
  });
}


// SCHEMA ======================================================================
function createGraphqlSchema(schemaFields){
	return new graphql.GraphQLSchema({
	  query: new graphql.GraphQLObjectType({
	    name: 'Query',
	    fields: schemaFields
	  })
	});
}

function createGraphqlSchemaFields(dataTypesIncoming, dataTypesOutgoing, dataTypesConstant){
	var fields = {};
	protoDesc.services.forEach(function(eachService){
		eachService.methods.forEach(function(eachMethod){
			console.log("");
			console.log("Method: " + eachMethod.name + "()");
			// Initial requests
			var inputType = dataTypesIncoming[eachMethod.inputType];
			var responseType = dataTypesConstant.responseTypeOfInitialRequest;
			createGraphqlSchemaFieldForInitialRequest(fields, eachMethod,
				eachService.name, responseType, inputType);
			// Methods to ask for status and results
			inputType = getMessageTypeOfStatusRequest(eachMethod.name);
			responseType = createMessageTypeOfStatusResponse(eachMethod,
				dataTypesOutgoing[eachMethod.outputType]);
			createGraphqlSchemaFieldForStatusRequest(fields,
				eachMethod, responseType, inputType);
			// Methods to send streamed messages
			inputType = new graphql.GraphQLList(dataTypesIncoming[eachMethod.inputType]);
			responseType = dataTypesConstant.responseTypeOfInitialRequest;
			createGraphqlSchemaFieldForStreamedInputSend(fields,
				eachMethod, responseType, inputType);
			// Methods to end stream
			inputType = dataTypesConstant.requestTypeOfStreamEnd;
			responseType = dataTypesConstant.responseTypeOfStreamEnd;
			createGraphqlSchemaFieldForStreamedInputEnd(fields,
				eachMethod, responseType, inputType);
			console.log("* Status request input type: " + inputType);
			console.log("* Status request output type: " + responseType);
		});
	});
	return fields;
}

function createGraphqlSchemaFieldForStreamedInputSend(fields, method,
	responseType, inputType){
	if (!(method.inputStreamed)){
		return;
	}
	//inputType = new graphql.GraphQLList(inputType);
	var methodName = method.name + "StreamSend";
	console.log("* Send Stream method name: " + methodName);
	console.log("  * inputType:");
	console.log(inputType);
	console.log("  * responseType: ");
	console.log(responseType);
	fields[methodName] = {
		type: responseType,
		args:{
			requestId: {
				type: graphql.GraphQLString
			},
			input: {
				type: inputType
			}
		}
	};
	fields[methodName].resolve = function(_, args, context, _,_) {
		return resolveRequestStreamedInputSend(method.name, args);
	};
}

function createGraphqlSchemaFieldForStreamedInputEnd(fields, method,
	responseType, inputType){
	if (!(method.inputStreamed)){
		return;
	}
	var methodName = method.name + "StreamEnd";
	console.log("* End Stream method name: " + method.name);
	fields[methodName] = {
		type: responseType,
		args:{
			requestId: {
				type: graphql.GraphQLString
			}
		}
	};
	fields[methodName].resolve = function(_, args, context, _,_) {
		return resolveRequestStreamedInputEnd(args.requestId);
	};
}

function createGraphqlSchemaFieldForInitialRequest(fields, method, serviceName,
	responseType, inputType){
	if (method.inputStreamed){
			inputType = new graphql.GraphQLList(inputType);
	}
	console.log("* Initial request method name: " + method.name);
	fields[method.name] = {
		type: responseType,
		args:{
			service: { type: graphql.GraphQLString },
			input: { type: inputType}
		}
	};
	if (method.inputStreamed){
		fields[method.name].resolve = function(_, args, context, _,_) {
			return resolveInitialRequestStreamedInputStart(method.name, serviceName, args, context);
		};
	} else {
		fields[method.name].resolve = function(_, args, context, _,_) {
			return resolveInitialRequest(method.name, serviceName, args, context);
		};
	}
}

function createGraphqlSchemaFieldForStatusRequest(fields, method,
	responseType, inputType){
	var methodName = method.name + "Status"
	console.log("* Status request method name: " + methodName);
	fields[methodName] = {
		type: responseType,
		args:{
			input: { type: inputType}
		}
	};
	var resolve;

	if (method.inputStreamed && method.outputStreamed){
		resolve = function(_, args, context, _,_) {
			return resolveStatusRequest(args);
		};
	} else if (method.inputStreamed){
		resolve = function(_, args, context, _,_) {
			return resolveStatusRequest(args);
		};
	} else if (method.outputStreamed){
		resolve = function(_, args, context, _,_) {
			return resolveStatusRequest(args);
		};
	} else {
		resolve = function(_, args, context, _,_) {
			return resolveStatusRequest(args);
		};
	}
	fields[method.name + "Status"].resolve = resolve;
}


// DATATYPES ===================================================================
function createGraphqlDataTypes(isInputType){
	var graphQlDataTypes = [];
		protoDesc.messages.forEach(function(eachMessage){
			console.log();
			if (isInputType) {
				console.log("Message: " + eachMessage.name + "Incoming");
			} else {
				console.log("Message: " + eachMessage.name + "Outgoing");
			}
			createGraphqlDataTypeOfMessage(protoDesc, eachMessage, graphQlDataTypes, isInputType);
		});
	return graphQlDataTypes;
}

function createGraphqlDataTypeOfMessage(protoDesc, message, graphQlDataTypes, isInputType){
	var messageParameterDataTypes = {};
	message.parameters.forEach(function(eachParameter){
		console.log("* parameter: " + eachParameter.name);
		console.log("  * gRPC type: " + eachParameter.type);
		var paramType = createGraphqlDataTypeOfMessageParameter(message, eachParameter,
			graphQlDataTypes, isInputType);
		if (eachParameter.repeated){
			paramType = new graphql.GraphQLList(paramType);
		}
		messageParameterDataTypes[eachParameter.name] = {
			type: paramType
		};

	});
	var graphQlObjectType = graphql.GraphQLObjectType;
	var typeName = message.name + "Outgoing";
	if (isInputType){
		graphQlObjectType = graphql.GraphQLInputObjectType
		typeName = message.name + "Incoming";
	}
	graphQlDataTypes[message.name] = new graphQlObjectType({
		name: typeName,
		fields: () => (messageParameterDataTypes)
	});
}

function createGraphqlDataTypeOfMessageParameter(message,
	msgParameter, graphQlDataTypes, isInputType){
	if (graphQlDataTypes[message.name]){
		return;
	}
	var t = msgParameter.type;
	var graphQlType;
	if ( t === 'int32' ||t==='int64'||t==='uint32'||t==='uint64'||
			 t==='sint32'||t==='sint64'||t==='fixed32'||t==='fixed64'||
			 t==='sfixed32'||t==='sfixed64'){
		graphQlType = graphql.GraphQLInt;
		console.log("  * graphQl type: graphql.GraphQLInt");
	} else if (t === 'double'||t==='float') {
		graphQlType = graphql.GraphQLFloat;
		console.log("  * graphQl type: graphql.GraphQLFloat");
	} else if (t==='bool'){
		graphQlType = graphql.GraphQLBoolean;
		console.log("  * graphQl type: graphql.GraphQLBoolean");
	} else if (t==='string'){
		graphQlType = graphql.GraphQLString;
		console.log("  * graphQl type: graphql.GraphQLString");
	} else if (t==='bytes'){
		graphQlType = graphql.GraphQLString;
		console.log("  * graphQl type: graphql.GraphQLString");
		if (isInputType){
			graphQlType = graphQlDataTypesConstant.bytesIncoming;
			console.log("  * graphQl type: bytes (complex type)");
		}
	} else if (isEnum(message, msgParameter)){
		graphQlType = graphql.GraphQLString;
		console.log("  * graphQl type: graphql.GraphQLString (enum)");
	} else {
		if (graphQlDataTypes[t] == undefined){
			var msg = protoDesc.getMessageOfType(t);
			createGraphqlDataTypeOfMessage(protoDesc, msg, graphQlDataTypes, isInputType);
		}
		graphQlType = graphQlDataTypes[t];
		console.log("  * graphQl type: " + t + " (complex type)");
	}

	return graphQlType;
}

function isEnum(message, parameter){
	var result = false;
	message.enums.forEach(function(eachEnum){
		if (eachEnum.name === parameter.type){
			result = true;
		}
	});
	return result;
}

function getMessageTypeOfStatusRequest(methodName){
	return new graphql.GraphQLInputObjectType({
		name: methodName + "StatusIncoming",
		fields: () => ({
			requestId: {
				type: graphql.GraphQLString
			}
		})
	});
}

function getMessageTypeOfStreamSend(methodName, inputMessageType){
	return new graphql.GraphQLInputObjectType({
		name: methodName + "StreamSend",
		fields: () => ({
			data: {
				type: inputMessageType
			}
		})
	});
}

function createMessageTypeOfStatusResponse(method, typeOfResult){
	var fields;

	if (method.inputStreamed && method.outputStreamed){
		fields = {
			status: {
				type: graphql.GraphQLString
			},
			result: {
				type: new graphql.GraphQLList(typeOfResult)
			}
		};
	} else if (method.inputStreamed){
		fields = {
			status: {
				type: graphql.GraphQLString
			},
			result: {
				type: new graphql.GraphQLList(typeOfResult)
			}
		};
	} else if (method.outputStreamed){
		fields = {
			status: {
				type: graphql.GraphQLString
			},
			result: {
				type: new graphql.GraphQLList(typeOfResult)
			}
		};
	} else {
		fields = {
			status: {
				type: graphql.GraphQLString
			},
			result: {
				type: new graphql.GraphQLList(typeOfResult)
			}
		};
	}

	return new graphql.GraphQLObjectType({
		name: method.name + "StatusOutgoing",
		fields: () => (fields)
	});
}

function createConstantGraphqlDataTypes(){
	var constantDataTypes = {};
	constantDataTypes.responseTypeOfInitialRequest = getResponseTypeOfInitialRequest();
	constantDataTypes.bytesIncoming = getMessageTypeOfBytes(true);
	constantDataTypes.bytesOutgoing = getMessageTypeOfBytes(false);
	constantDataTypes.requestTypeOfStreamEnd = getRequestTypeOfStreamEnd();
	constantDataTypes.responseTypeOfStreamEnd = getResponseTypeOfStreamEnd();
	return constantDataTypes;
}

function getRequestTypeOfStreamEnd(){
	return new graphql.GraphQLInputObjectType({
		name: "__ConstantTypeRequestStreamEnd",
		fields: () => ({
			requestId: {
				type: graphql.GraphQLString
			}
		})
	});
}

function getResponseTypeOfStreamEnd(){
	return new graphql.GraphQLObjectType({
		name: "__ConstantTypeResponseStreamEnd",
		fields: () => ({
			requestId: {
				type: graphql.GraphQLString
			}
		})
	});
}

// TODO DELETE OUTPUT TYPE
function getMessageTypeOfBytes(isInputType){
	var objectType = graphql.GraphQLObjectType;
	var name = "__ConstantTypeOutgoingBytes"
	if (isInputType){
		objectType = graphql.GraphQLInputObjectType;
		name = "__ConstantTypeIncomingBytes";
	}
	return new objectType({
		name: name,
		fields: () => ({
			host: {
				type: graphql.GraphQLString
			},
			port: {
				type: graphql.GraphQLString
			},
			user: {
				type: graphql.GraphQLString
			},
			password: {
				type: graphql.GraphQLString
			},
			filePath: {
				type: graphql.GraphQLString
			},
			format: {
				type: graphql.GraphQLString
			},
			__typeFlagBytes__: {
				type: graphql.GraphQLBoolean
			}
		})
	});
}

function getResponseTypeOfInitialRequest(){
	return new graphql.GraphQLObjectType({
		name: "Response",
		fields: () => ({
			requestId: {
				type: graphql.GraphQLString
			}
		})
	});
}

// INIT =======================================================================
function loadProtoDesc(absolutePathToProtoFile){
	var parser = require('./grpcParser.js');
	var protoDesc = parser.parse(absolutePathToProtoFile);
	return protoDesc;
}

function initVariables(){
	if (process.argv[2] != "" && process.argv[2] != null){
		PORT_GRAPHQL = process.argv[2];
	}
	if (process.env.API_PROTO_PATH != null) {
    pathToProtoFile = process.env.API_PROTO_PATH;
  }
  if (process.env.API_HOST != null) {
    HOST_GRPC_SERVER = process.env.API_HOST;
  }
  if (process.env.API_PORT != null) {
    PORT_GRPC_SERVER = process.env.API_PORT;
  }
}
