
function loadProtoFile(absolutePath){
  var fs = require('fs');
  var protoFile = fs.readFileSync(absolutePath, 'utf8');
  return protoFile;
}

function removeCommentsInProtoFile(protoFile){
  var splittedProtoFile = protoFile.split("\n");
  var splittedProtoFileTransformed = [];
  splittedProtoFile.forEach(function(eachLine){
    var comment = eachLine.match(/^\s*\/\//);
    if (comment){
      return;
    }
    comment = eachLine.match(/^([^\/\/]*)\/\/.*/);
    if (comment){
      splittedProtoFileTransformed.push(comment[1]);
    } else {
      splittedProtoFileTransformed.push(eachLine);
    }
  });

  return splittedProtoFileTransformed.join("\n");
}


function restructureNestedMessages(protoDesc){
  // TODO
}

function restructureMessages(protoDesc){
  protoDesc.messages.forEach(function(eachMessage){
    eachMessage.nestedMessages = [];
    eachMessage.parameters = [];
    eachMessage.enums = [];
    eachMessage.content.forEach(function(eachContent){
      if (eachContent.nestedMessage != undefined){
        eachMessage.nestedMessages.push(eachContent.nestedMessage);
      }
      if (eachContent.parameter != undefined){
        eachMessage.parameters.push(eachContent.parameter);
      }
      if (eachContent.enumDef != undefined){
        eachMessage.enums.push(eachContent.enumDef);
      }
      delete eachMessage["content"];
    });
    eachMessage.getEnumWithName = getEnumWithName;
  });
  return protoDesc;
}

function getEnumWithName(enumName){
  var result;
  this.enums.forEach(function(eachEnum){
    if (eachEnum.name === enumName){
      result = eachEnum;
    }
  });
  return result;
}


function getMethodWithName(methodName){
  var result;
  this.services.forEach(function(eachService){
    eachService.methods.forEach(function(eachMethod){
      if (eachMethod.name === methodName){
        result = eachMethod;
      }
    });
  });
  return result;
}

function getMessageOfType(messageType){
  var result;
  this.messages.forEach(function(eachMessage){
    if (eachMessage.name === messageType){
      result = eachMessage;
    }
  });
  return result;
}

function parse(absolutePathToProtoFile){
  var parser = require('./grpcPegParser.js');
  var protoFile = loadProtoFile(absolutePathToProtoFile);
  protoFile = removeCommentsInProtoFile(protoFile);
  var protoDesc = parser.parse(protoFile);
  restructureMessages(protoDesc);
  restructureNestedMessages(protoDesc);
  protoDesc.getMessageOfType = getMessageOfType;
  protoDesc.getMethodWithName = getMethodWithName;
  return protoDesc;
}

module.exports = {
  parse: parse
};
