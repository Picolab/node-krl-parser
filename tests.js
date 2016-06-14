var _ = require('lodash');
var test = require('tape');
var parser = require('./');

var normalizeAST = function(ast){
  if(_.isArray(ast)){
    return _.map(ast, normalizeAST);
  }
  if(_.isPlainObject(ast)){
    if(ast.type === 'RegExp'){
      if((new RegExp('/')).toString() === '///'){//old versions of v8 botch this
        ast.value = '/' + ast.value.source.split('\\').join('') + '/'
          + (ast.value.global ? 'g' : '')
          + (ast.value.ignoreCase ? 'i' : '');
      }else{
        ast.value = ast.value.toString();
      }
    }
  }
  return ast;
};

var rmLoc = function(ast){
  if(_.isArray(ast)){
    return _.map(ast, rmLoc);
  }
  if(_.isPlainObject(ast)){
    return _.mapValues(_.omit(ast, 'loc'), rmLoc);
  }
  return ast;
};

var parseRuleBody = function(rule_body, expected){
  var src = '';
  src += 'ruleset rs {\n';
  src += '  rule r1 {\n';
  src += '    ' + rule_body + '\n';
  src += '  }\n';
  src += '}';
  return parser(src)[0].rules[0];
};

var mkEventExp = function(domain, type){
  return {
    type: 'event_expression',
    event_domain: {type: 'Symbol', value: domain},
    event_type: {type: 'Symbol', value: type}
  };
};

var mkEventOp = function(op, exprs, args){
  return {
    type: 'event_op',
    op: op,
    args: args || [],
    expressions: exprs
  };
};

var assertAST = function(t, src, ast){
  t.deepEquals(parser(src), ast);
};

test('parser', function(t){
  var src = '';
  src += 'ruleset rs {\n';
  src += '}';

  assertAST(t, src, [
    {
      type: 'ruleset',
      loc: {start: 0, end: 14},

      name: {type: 'Symbol', value: 'rs', loc: {start: 8, end: 10}},
      rules: []
    }
  ]);

  src = '';
  src += 'ruleset rs {\n';
  src += '  rule r1 {}\n';
  src += '}';

  assertAST(t, src, [
    {
      type: 'ruleset',
      loc: {start: 0, end: 27},

      name: {type: 'Symbol', value: 'rs', loc: {start: 8, end: 10}},
      rules: [
        {
          type: 'rule',
          loc: {start: 15, end: 25},
          name: {type: 'Symbol', value: 'r1', loc: {start: 20, end: 22}},
        }
      ]
    }
  ]);

  src = '';
  src += 'ruleset rs {\n';
  src += '  rule r1 {}\n';
  src += '  rule r2 {}\n';
  src += '}';

  assertAST(t, src, [
    {
      type: 'ruleset',
      loc: {start: 0, end: 40},

      name: {type: 'Symbol', value: 'rs', loc: {start: 8, end: 10}},
      rules: [
        {
          type: 'rule',
          loc: {start: 15, end: 25},
          name: {type: 'Symbol', value: 'r1', loc: {start: 20, end: 22}},
        },
        {
          type: 'rule',
          loc: {start: 28, end: 38},
          name: {type: 'Symbol', value: 'r2', loc: {start: 33, end: 35}},
        }
      ]
    }
  ]);

  t.end();
});

test('parser - select when', function(t){
  var asertRuleAST = function(rule_body, expected){
    var ast = parseRuleBody(rule_body).select;
    t.equals(ast.type, 'select_when');
    t.deepEquals(rmLoc(ast.event_expressions), expected);
  }; 

  var src = 'select when d t';
  asertRuleAST(src, {
    type: 'event_expression',
    event_domain: {type: 'Symbol', value: 'd'},
    event_type: {type: 'Symbol', value: 't'}
  });

  src = 'select when d a or d b';
  asertRuleAST(src, {
    type: 'event_op',
    op: 'or',
    args: [],
    expressions: [
      {
        type: 'event_expression',
        event_domain: {type: 'Symbol', value: 'd'},
        event_type: {type: 'Symbol', value: 'a'}
      },
      {
        type: 'event_expression',
        event_domain: {type: 'Symbol', value: 'd'},
        event_type: {type: 'Symbol', value: 'b'}
      }
    ]
  });

  src = 'select when d a and d b';
  asertRuleAST(src, mkEventOp('and', [mkEventExp('d', 'a'), mkEventExp('d', 'b')]));

  src = 'select when d a and (d b or d c)';
  asertRuleAST(src, mkEventOp('and', [
    mkEventExp('d', 'a'),
    mkEventOp('or', [mkEventExp('d', 'b'), mkEventExp('d', 'c')])
  ]));

  t.end();
});

test('parser - action', function(t){
  var asertRuleAST = function(rule_body, expected){
    var ast = parseRuleBody('select when d a\n' + rule_body);
    var exp_ast = {
      name: rmLoc(ast.name),
      type: ast.type,
      select: {type: 'select_when', event_expressions: mkEventExp('d', 'a')},
    };
    if(_.size(expected) > 0){
      exp_ast.actions = [expected];
    }
    t.deepEquals(rmLoc(ast), exp_ast);
  };

  var src ='send_directive("say")';
  asertRuleAST(src, {
    type: 'send_directive',
    args: [
      {type: 'String', value: 'say'}
    ]
  });

  src  = 'send_directive("say") with\n';
  src += '  something = "hello world"\n';
  asertRuleAST(src, {
    type: 'send_directive',
    args: [
      {type: 'String', value: 'say'}
    ],
    "with": {
      type: "with_expression",
      pairs: [
        [
          {type: 'Symbol', value: 'something'},
          {type: 'String', value: 'hello world'}
        ]
      ]
    }
  });


  var mkPair = function(key, val){
    return [
      {type: 'Symbol', value: key},
      {type: 'Number', value: parseFloat(val)}
    ];
  };
  src  = 'send_directive("say") with\n';
  src += '  one = 1\n';
  src += '  and\n';
  src += '  two = 2\n';
  src += '  and\n';
  src += '  three = 3\n';
  asertRuleAST(src, {
    type: 'send_directive',
    args: [
      {type: 'String', value: 'say'}
    ],
    "with": {
      type: "with_expression",
      pairs: [
        mkPair('one', '1'),
        mkPair('two', '2'),
        mkPair('three', '3')
      ]
    }
  });

  t.end();
});

test('parser - locations', function(t){
  var src = '';
  src += 'ruleset one {\n';
  src += '  rule two {\n';
  src += '  }\n';
  src += '}\n';

  t.deepEquals(parser(src)[0], {
    type: 'ruleset',
    loc: {start: 0, end: 32},
    name: {
      loc: {start: 8, end: 11},
      type: 'Symbol',
      value: 'one'
    },
    rules: [
      {
        loc: {start: 16, end: 30},
        type: 'rule',
        name: {
          loc: {start: 21, end: 24},
          type: 'Symbol',
          value: 'two'
        }
      }
    ]
  });

  src = 'select when a b';
  t.deepEquals(parser('ruleset one {rule two {' + src + '}}')[0].rules[0].select, {
    loc: {start: 23, end: 38},
    type: 'select_when',
    event_expressions: {
      loc: {start: 35, end: 38},
      type: 'event_expression',
      event_domain: {
        loc: {start: 35, end: 36},
        type: 'Symbol',
        value: 'a'
      },
      event_type: {
        loc: {start: 37, end: 38},
        type: 'Symbol',
        value: 'b'
      }
    }
  });

  src = 'select when a b or c d';
  t.deepEquals(parser('ruleset one {rule two {' + src + '}}')[0].rules[0].select.event_expressions, {
    loc: {start: 35, end: 45},
    type: 'event_op',
    op: 'or',
    args: [],
    expressions: [
      {
        loc: {start: 35, end: 38},
        type: 'event_expression',
        event_domain: {
          loc: {start: 35, end: 36},
          type: 'Symbol',
          value: 'a'
        },
        event_type: {
          loc: {start: 37, end: 38},
          type: 'Symbol',
          value: 'b'
        }
      },
      {
        loc: {start: 42, end: 45},
        type: 'event_expression',
        event_domain: {
          loc: {start: 42, end: 43},
          type: 'Symbol',
          value: 'c'
        },
        event_type: {
          loc: {start: 44, end: 45},
          type: 'Symbol',
          value: 'd'
        }
      }
    ]
  });
  src = 'select when a b\nsend_directive("say")';
  t.deepEquals(parser('ruleset one {rule two {' + src + '}}')[0].rules[0].actions[0], {
    loc: {start: 39, end: 58},
    type: 'send_directive',
    args: [
      {
        loc: {start: 53, end: 58},
        type: 'String',
        value: 'say'
      }
    ]
  });
  src = 'select when a b\nsend_directive("say") with\nblah = 1';
  t.deepEquals(parser('ruleset one {rule two {' + src + '}}')[0].rules[0].actions[0], {
    loc: {start: 39, end: 74},
    type: 'send_directive',
    args: [
      {
        loc: {start: 53, end: 58},
        type: 'String',
        value: 'say'
      }
    ],
    'with': {
      loc: {start: 61, end: 74},
      type: 'with_expression',
      pairs: [
        [
          {
            loc: {start: 66, end: 70},
            type: 'Symbol',
            value: 'blah',
          },
          {
            loc: {start: 73, end: 74},
            type: 'Number',
            value: 1
          }
        ]
      ]
    }
  });

  t.deepEquals(parser('a => b | c')[0], {
    loc: {start: 0, end: 10},
    type: 'ConditionalExpression',
    test:       {type: 'Symbol', value: 'a', loc: {start: 0, end: 1}},
    consequent: {type: 'Symbol', value: 'b', loc: {start: 5, end: 6}},
    alternate:  {type: 'Symbol', value: 'c', loc: {start: 9, end: 10}}
  });

  t.end();
});

test('parser - literals', function(t){
  var testLiteral = function(src, expected){
    var ast = normalizeAST(rmLoc(parser(src)));
    expected = normalizeAST(expected);
    t.deepEquals(ast, [expected]);
  };
  testLiteral('"one"', {type: 'String', value: 'one'});
  testLiteral('"one\ntwo"', {type: 'String', value: 'one\ntwo'});
  testLiteral('"one\\"two"', {type: 'String', value: 'one"two'});

  testLiteral('123', {type: 'Number', value: 123});
  testLiteral('-1', {type: 'Number', value: -1});
  testLiteral('1.5', {type: 'Number', value: 1.5});
  testLiteral('+1.5', {type: 'Number', value: 1.5});
  testLiteral('-.50', {type: 'Number', value: -0.5});
  testLiteral('-0.0', {type: 'Number', value: 0});

  testLiteral('true', {type: 'Boolean', value: true});
  testLiteral('false', {type: 'Boolean', value: false});

  testLiteral('[]', {type: 'Array', value: []});
  testLiteral('["one"]', {type: 'Array', value: [{type: 'String', value: 'one'}]});
  testLiteral('[  1,  false ]', {type: 'Array', value: [
    {type: 'Number', value: 1},
    {type: 'Boolean', value: false}
  ]});

  testLiteral('{}', {type: 'Object', value: []});
  testLiteral('{ "one" : "two" }', {type: 'Object', value: [
    [{type:'String',value:'one'},{type:'String',value:'two'}]
  ]});
  testLiteral('{"1":2,"3":true,"5":[]}', {type: 'Object', value: [
    [{type:'String',value:'1'},{type:'Number',value:2}],
    [{type:'String',value:'3'},{type:'Boolean',value:true}],
    [{type:'String',value:'5'},{type:'Array',value:[]}]
  ]});

  testLiteral('re#one#', {type: 'RegExp', value: /one/});
  testLiteral('re#one#i', {type: 'RegExp', value: /one/i});
  testLiteral('re#one#ig', {type: 'RegExp', value: /one/ig});
  testLiteral('re#^one(/two)? .* $#ig', {type: 'RegExp', value: /^one(\/two)? .* $/ig});
  testLiteral('re#\\# else\\\\#ig', {type: 'RegExp', value: /# else\\/ig});
  testLiteral('re#/ok/g#ig', {type: 'RegExp', value: /\/ok\/g/ig});

  testLiteral('<<>>', {
    type: 'DoubleQuote',
    value: [
      {type: 'String', value: ''}
    ]
  });
  testLiteral('<<\n  hello\n  >>', {
    type: 'DoubleQuote',
    value: [
      {type: 'String', value: '\n  hello\n  '}
    ]
  });
  testLiteral('<<#{1}>>', {
    type: 'DoubleQuote',
    value: [
      {type: 'String', value: ''},
      {type: 'Number', value: 1},
      {type: 'String', value: ''}
    ]
  });

  testLiteral('<<one#{2}three>>', {
    type: 'DoubleQuote',
    value: [
      {type: 'String', value: 'one'},
      {type: 'Number', value: 2},
      {type: 'String', value: 'three'}
    ]
  });

  testLiteral('<<one#{{"one":2}}three>>', {
    type: 'DoubleQuote',
    value: [
      {type: 'String', value: 'one'},
      {type: 'Object', value: [[{type:'String',value:'one'},{type:'Number',value:2}]]},
      {type: 'String', value: 'three'}
    ]
  });

  t.end();
});

test('parser - expressions', function(t){
  var testExp = function(src, expected){
    var ast = normalizeAST(rmLoc(parser(src)));
    expected = normalizeAST(expected);
    t.deepEquals(ast, [expected]);
  };

  testExp('one()', {
    type: 'CallExpression',
    callee: {type: 'Symbol', value: 'one'},
    args: []
  });
  testExp('one ( 1 , 2 )', {
    type: 'CallExpression',
    callee: {type: 'Symbol', value: 'one'},
    args: [{type: 'Number', value: 1}, {type: 'Number', value: 2}]
  });
  testExp('one(1,2)', {
    type: 'CallExpression',
    callee: {type: 'Symbol', value: 'one'},
    args: [{type: 'Number', value: 1}, {type: 'Number', value: 2}]
  });

  testExp('1 + "two"', {
    type: 'InfixOperator',
    op: '+',
    left: {type: 'Number', value: 1},
    right: {type: 'String', value: 'two'}
  });

  testExp('1 like re#one#i', {
    type: 'InfixOperator',
    op: 'like',
    left: {type: 'Number', value: 1},
    right: {type: 'RegExp', value: /one/i}
  });

  testExp('a => b | c', {
    type: 'ConditionalExpression',
    test:       {type: 'Symbol', value: 'a'},
    consequent: {type: 'Symbol', value: 'b'},
    alternate:  {type: 'Symbol', value: 'c'}
  });

  testExp('a => b | c => d | e', {
    type: 'ConditionalExpression',
    test:       {type: 'Symbol', value: 'a'},
    consequent: {type: 'Symbol', value: 'b'},
    alternate:  {
      type: 'ConditionalExpression',
      test:       {type: 'Symbol', value: 'c'},
      consequent: {type: 'Symbol', value: 'd'},
      alternate:  {type: 'Symbol', value: 'e'}
    }
  });

  testExp('a=>b|c=>d|e', {
    type: 'ConditionalExpression',
    test:       {type: 'Symbol', value: 'a'},
    consequent: {type: 'Symbol', value: 'b'},
    alternate:  {
      type: 'ConditionalExpression',
      test:       {type: 'Symbol', value: 'c'},
      consequent: {type: 'Symbol', value: 'd'},
      alternate:  {type: 'Symbol', value: 'e'}
    }
  });

  t.end();
});

test('parser - operator precedence', function(t){
  var testPrec = function(src, expected){
    var ast = normalizeAST(rmLoc(parser(src)));
    var s = function(ast){
      if(_.isArray(ast)){
        return _.map(ast, s).join(' ');
      }else if(ast.type === 'InfixOperator'){
        return '(' + ast.op + ' ' + s(ast.left) + ' ' + s(ast.right) + ')';
      }
      return ast.value;
    };
    t.equals(s(ast), expected);
  };

  testPrec('a + b', '(+ a b)');
  testPrec('a+b+c', '(+ (+ a b) c)');
  testPrec('a+b*c', '(+ a (* b c))');

  testPrec('a || b && c', '(|| a (&& b c))');
  testPrec('(a || b) && c', '(&& (|| a b) c)');

  testPrec('a && b cmp c', '(&& a (cmp b c))');

  testPrec('a * b < c && d', '(&& (< (* a b) c) d)');

  t.end();
});
