
var javaImport = new JavaImporter(); 
javaImport.importPackage(
    Packages.java.lang, 
    Packages.javax.crypto.spec, 
    Packages.javax.crypto, 
    Packages.java.util
); 
with(javaImport) { 
    function decode(content) { 
        var ivEncData = Base64.getDecoder().decode(String(content)); 
        var key = SecretKeySpec(String("242ccb8230d709e1").getBytes(), "AES");
        var iv = IvParameterSpec(Arrays.copyOfRange(ivEncData, 0, 16));
        var chipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        chipher.init(2, key, iv);
        return String(chipher.doFinal(Arrays.copyOfRange(ivEncData, 16, ivEncData.length)));
    }
}


sign_key='d3dGiJc651gSQ8w1'

params={'id':String(java.get('bid')),'chapterId':String(baseUrl.split("/").pop())}

var urlEncode = function (param, key, encode) {  
  if(param==null) return '';  
  var paramStr = '';  
  var t = typeof (param);  
  if (t == 'string' || t == 'number' || t == 'boolean') {  
    paramStr += '&' + key + '=' + ((encode==null||encode) ? encodeURIComponent(param) : param);  
  } else {  
    for (var i in param) {  
      var k = key == null ? i : key + (param instanceof Array ? '[' + i + ']' : '.' + i);  
      paramStr += urlEncode(param[i], k, encode);  
    }
  }
  return paramStr;
};

paramSign=String(java.md5Encode(Object.keys(params).sort().reduce((pre,n)=>pre+n+'='+params[n],'')+sign_key))
params['sign']=paramSign
url="https://api-ks.wtzw.com/api/v1/chapter/content?"+urlEncode(params)
decode(JSON.parse(java.ajax(url+','+java.get("headers"))).data.content)

