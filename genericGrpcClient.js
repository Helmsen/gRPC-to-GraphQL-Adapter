
module.exports = genericGrpcClient;

function genericGrpcClient(serverHost, serverPort, pathToProtoFile, protoDesc){
  console.log("");
  console.log("GenericGrpcClient");
  console.log("* gRPC server host: " + serverHost);
  console.log("* gRPC server port: " + serverPort);
  console.log("* path to proto file: " + pathToProtoFile);
  var self = this;
  var grpc = require('grpc');
  var grpcLoaded = grpc.load(pathToProtoFile);
  var host = serverHost;
  var port = serverPort;
  var protoDesc = protoDesc;

  this.callGrpcMethod = function(serviceName, methodName,
    methodParameters, cache, requestId){
    console.log();
    console.log("Call gRPC method: " + methodName);
    console.log("* service: " + serviceName);
    console.log("* params: ");
    console.log(methodParameters);
    var methodInputIsStreamed = protoDesc.
    getMethodWithName(methodName).inputStreamed;
    var methodOutputIsStreamed = protoDesc.
    getMethodWithName(methodName).outputStreamed;
    if (methodInputIsStreamed && methodOutputIsStreamed){
      console.log("* streamed input and output");
      callMethodWithStreamedInputAndOutput(serviceName, methodName, methodParameters,
        cache, requestId);
    } else if (methodInputIsStreamed){
      console.log("* streamed input");
      callMethodWithStreamedInput(serviceName, methodName, methodParameters,
        cache, requestId);
    } else if (methodOutputIsStreamed){
      console.log("* streamed output");
      callMethodWithStreamedOutput(serviceName, methodName, methodParameters,
        cache, requestId);
    } else {
      console.log("* not Streamed");
      callNormalMethod(serviceName, methodName, methodParameters,
        cache, requestId);
    }
  }

  var callNormalMethod = function(serviceName, methodName,
    methodParameters, cache, requestId){
    var stub = getGrpcStub(serviceName);
    cache[requestId].responses = [];
    cache[requestId].status = "expecting more responses";
    stub[methodName](methodParameters, function(err, result){
      cache[requestId].responses.push(result);
      cache[requestId].status = "done";
    });
  }

  var callMethodWithStreamedOutput = function(serviceName, methodName,
    methodParameters, cache, requestId){
    var stub = getGrpcStub(serviceName);
    var call = stub[methodName](methodParameters);
    cache[requestId].responses = [];
    call.on('data', function(data){
      cache[requestId].status = "expecting more responses";
      cache[requestId].responses.push(data);
    });
    call.on('end', function(){
      cache[requestId].status = "done";
    });
    call.on('status', function(status){
    });
  }

  var callMethodWithStreamedInput = function(serviceName, methodName,
    methodParameters, cache, requestId){
    var stub = getGrpcStub(serviceName);
    cache[requestId].responses = [];
    cache[requestId].status = "expecting more responses";
    var call = stub[methodName](function(error, result){
      cache[requestId].responses.push(result);
      cache[requestId].status = "done";
    });
    cache[requestId].call = call;
    methodParameters.forEach(function(eachParam){
      call.write(eachParam);
    });
  }

  this.streamToGrpcServer = function(methodParameters, cache, requestId){
    var call = cache[requestId].call;
    methodParameters.forEach(function(eachParam){
      call.write(eachParam);
    });
  }

  this.closeStreamToGrpcServer = function(cache, requestId){
    var call = cache[requestId].call;
    call.end();
  }

  var callMethodWithStreamedInputAndOutput = function(serviceName, methodName,
    methodParameters, cache, requestId){
      var stub = getGrpcStub(serviceName);
      cache[requestId].responses = [];
      cache[requestId].status = "expecting more responses";
      var call = stub[methodName]();
      cache[requestId].call = call;
      call.on('data', function(data){
        cache[requestId].responses.push(data);
    	});
    	call.on('status', function(status){
    	});
    	call.on('end', function(){
        cache[requestId].status = "done";
    	});
      methodParameters.forEach(function(eachParam){
        call.write(eachParam);
      });
  }

  var getGrpcStub = function(serviceName){
    var grpcLoadedTmp = grpcLoaded;
    var stub;
    if (protoDesc.package != undefined){
      var package = protoDesc.package.split('.');
      package.forEach(function(val){
  			grpcLoadedTmp = grpcLoadedTmp[val];
  		});
    }
    stub = new grpcLoadedTmp[serviceName](host + ":" + port,
    grpc.credentials.createInsecure());
    return stub;
  }
}
