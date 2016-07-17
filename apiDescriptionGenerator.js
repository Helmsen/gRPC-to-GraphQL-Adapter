module.exports = apiDescriptionGenerator;

function apiDescriptionGenerator(protoDesc, host, port){
  var markdown = require("markdown").markdown;
  var protoDesc = protoDesc;
  var doc = "";
  var createDescription = function(host, port){
    createHeader();
    protoDesc.services.forEach(function(eachService){
      addLine("## Service: " + eachService.name,0 , true);
      eachService.methods.forEach(function(eachMethod){
        addLine("### " + eachMethod.name + "()", 0, true);
        addLine("#### Initial Request", 0, true);
        addInitialRequestMethodDescription(eachService.name, eachMethod.name, eachMethod.inputType, eachMethod.inputStreamed);
        if (eachMethod.inputStreamed){
          addLine("#### Stream Message", 0, true);
          addStreamMessageMethodDescription(eachService.name, eachMethod.name, eachMethod.inputType, eachMethod.inputStreamed);
          addLine("#### Close Stream", 0, true);
          addCloseStreamMethodDescription( eachMethod.name);
        }
        addLine("#### Status Request", 0, true);
        addStatusRequestMethodDescription(eachService.name, eachMethod.name, eachMethod.outputType);
      })
    });
  }
  var addCloseStreamMethodDescription = function(methodName){
    addLine("{");
    addLine(methodName + "StreamEnd(", 2);
    addLine("requestId: " + "<\"string\">", 4);
    addLine(")", 2);
    addLine("{", 2);
    addLine("requestId", 4);
    addLine("}", 2);
    addLine("}");
  }
  var addStreamMessageMethodDescription = function(serviceName, methodName, methodInputType, inputStreamed){
    addLine("{");
    addLine(methodName + "StreamSend(", 2);
    addLine("requestId: " + "<\"string\">", 4);
    addLine("input: [{", 4);
    addParametersOfMessage(protoDesc.getMessageOfType(methodInputType), 6, false);
    addLine("}, ...]", 4);
    addLine(")", 2);
    addLine("{", 2);
    addLine("requestId", 4);
    addLine("}", 2);
    addLine("}");
  }
  var addInitialRequestMethodDescription = function(serviceName, methodName, methodInputType, inputStreamed){
    var lineInputbegin = "input: {";
    var lineInputEnd = "}";
    if (inputStreamed){
      lineInputbegin = "input: [{";
      lineInputEnd = "}, ...]";
    }
    addLine("{");
    addLine(methodName + "(", 2);
    addLine("service: \"" + serviceName + "\",", 4);
    addLine(lineInputbegin, 4);
    addParametersOfMessage(protoDesc.getMessageOfType(methodInputType), 6, false);
    addLine(lineInputEnd, 4);
    addLine(")", 2);
    addLine("{", 2);
    addLine("requestId", 4);
    addLine("}", 2);
    addLine("}");
  }
  var addStatusRequestMethodDescription = function(serviceName, methodName, methodInputType){
    addLine("{");
    addLine(methodName + "Status(", 2);
    addLine("input: {", 4);
    addLine("requestId: " + "<\"string\">", 6);
    addLine("}", 4);
    addLine(")", 2);
    addLine("{", 2);
    addLine("status,", 4);
    addLine("result {", 4);
    addParametersOfMessage(protoDesc.getMessageOfType(methodInputType), 6, true);
    addLine("}", 4);
    addLine("}", 2);
    addLine("}");
  }
  var addParametersOfMessage = function(message, indentions, addOnlyParamName){
    message.parameters.forEach(function(eachParam){
      var t = eachParam.type;
    	if ( t === 'int32' ||t==='int64'||t==='uint32'||t==='uint64'||
    			 t==='sint32'||t==='sint64'||t==='fixed32'||t==='fixed64'||
    			 t==='sfixed32'||t==='sfixed64'){
    		addParamDescription(eachParam.name, "<number>", eachParam.repeated, indentions, addOnlyParamName);
    	} else if (t === 'double'||t==='float') {
        addParamDescription(eachParam.name, "<number>", eachParam.repeated, indentions, addOnlyParamName);
    	} else if (t==='bool'){
        addParamDescription(eachParam.name, "<true or false>", eachParam.repeated, indentions, addOnlyParamName);
    	} else if (t==='string'){
        addParamDescription(eachParam.name, "<\"string\">", eachParam.repeated, indentions, addOnlyParamName);
    	} else if (t==='bytes'){
        addParamDescriptionForBytes(eachParam.name, eachParam.repeated, indentions, addOnlyParamName);
    	} else if (isEnum(message, eachParam)){
        var enumValues = "<";
        message.getEnumWithName(eachParam.type).values.forEach(function(eachValue){
          enumValues += "\"" + eachValue + "\"" + " or "
        });
        enumValues = enumValues.substring(0, enumValues.length - 4);
        enumValues += ">";
        addParamDescription(eachParam.name, enumValues, eachParam.repeated, indentions, addOnlyParamName);
    	} else {
        var firstLine = eachParam.name + ": {";
        var lastLine = "},";
        if (eachParam.repeated){
          firstLine = eachParam.name + ": [{";
          lastLine = "}, ...],";
        }
        if (addOnlyParamName){
          firstLine = eachParam.name + "{";
          lastLine = "},";
        }
        addLine(firstLine ,indentions);
        addParametersOfMessage(protoDesc.getMessageOfType(t), indentions + 2, addOnlyParamName);
        addLine(lastLine ,indentions);
    	}
    });
    removeLastComma();
  }
  var addParamDescriptionForBytes = function(paramName, isRepeated, indentions, addOnlyParamName){
    if (addOnlyParamName){
        addLine(paramName + ",",indentions);
    } else {
      if (isRepeated){
        addLine(paramName);
        //addLine(paramName + ": [" + type + ", ...]," ,indentions);
      } else {
        addLine(paramName + ": {", indentions);
        addLine("host: <\"string\">,", indentions + 2);
        addLine("port: <\"string\">,", indentions + 2);
        addLine("user: <\"string\">,", indentions + 2);
        addLine("password: <\"string\">,", indentions + 2);
        addLine("filePath: <\"string\">,", indentions + 2);
        addLine("__typeFlagBytes__: true (must be set to true)", indentions + 2);
        addLine("},", indentions)
        //addLine(paramName + ": " + type + "," ,indentions);
      }
    }
  }
  var addParamDescription = function(paramName, type, isRepeated, indentions, addOnlyParamName){
    if (addOnlyParamName){
        addLine(paramName + ",",indentions);
    } else {
      if (isRepeated){
        addLine(paramName + ": [" + type + ", ...]," ,indentions);
      } else {
        addLine(paramName + ": " + type + "," ,indentions);
      }
    }
  }
  var isEnum = function(message, parameter){
  	var result = false;
  	message.enums.forEach(function(eachEnum){
  		if (eachEnum.name === parameter.type){
  			result = true;
  		}
  	});
  	return result;
  }
  var addLine = function(line, indentions, plainText){
    if (indentions == undefined || indentions < 0){
      indentions = 0;
    }
    for (var i = 0; i < indentions; i++){
      doc += " ";
    }
    if (plainText == undefined || !plainText){
      doc += "    ";
    }
    doc += line + " \n";
  }
  var removeLastComma = function(){
    doc = doc.substring(0, doc.length - 3);
    doc += "\n";
  }
  var createHeader = function(){
    addLine("# API Description",0 , true);
    addLine("There are at least two graphQl queries for each gRPC method. "
    + "The *Initial Request* query calls the method of the adapted API asynchronously and "
    + "returns a request id. "
    + "The *Status Request* queries the status of a method call and delivers "
    + "next currently available result. ", 0, true);
    addLine("gRPC Methods with streamed input messages have two further graphQl queries. "
    + "The *Stream Message* query sends a message object as part of the input stream. "
    + "The *Close Stream* query closes the input stream. This is important, "
    + "because it is possible, that the adapted gRPC server waits to process the input until "
    + "the stream is closed. ",0,true);
    addLine("GraphQl queries are HTTP Post requests with header "
    + "\"Content-Type:application/graphql\" and "
    + "JSON objects in the message bodies as described in the following. "
    + "The adapter is listening on " + host + ":" + port + "/graphql.",0, true);
  }
  this.getDoc = function(){
    return doc;
  }
  this.getDocForBrowser = function(){
    return markdown.toHTML(doc);
  }
  createDescription(host, port);
}
