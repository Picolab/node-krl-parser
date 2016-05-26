@{%

var echo = function(data, location, reject){
  return {data: data, location: location};
};

var getN = function(n){
  return function(data){
    return data[n];
  };
};

%}

main -> _ ruleset _ {% getN(1) %}

ruleset -> "ruleset" __ symbol _ "{}" {%
  function(data, loc){
    return {
      type: 'ruleset',
      loc: loc,

      name: data[2].src,
      value: []
    };
  }
%}

symbol -> [\w]:+  {%
  function(data, loc){
    return {
      type: 'symbol',
      loc: loc,
      src: data[0].join('')
    };
  }
%}

int -> [0-9]:+ {%
  function(data, loc){
    return {
      type: 'int',
      loc: loc,
      src: data[0].join('')
    };
  }
%}

# Whitespace. The important thing here is that the postprocessor
# is a null-returning function. This is a memory efficiency trick.
_  -> [\s]:* {% function(){return null;} %}
__ -> [\s]:+ {% function(){return null;} %}
