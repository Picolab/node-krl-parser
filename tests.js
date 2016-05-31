var _ = require('lodash');
var test = require('tape');
var parser = require('./');

var rmLoc = function(ast){
  if(_.isArray(ast)){
    return _.map(_.compact(ast), rmLoc);
  }
  if(_.isObject(ast)){
    return _.mapValues(_.omit(ast, 'loc'), rmLoc);
  }
  return ast;
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
      loc: 0,

      name: 'rs',
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
      loc: 0,

      name: 'rs',
      rules: [
        {type: 'rule', loc: 15, name: 'r1'}
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
      loc: 0,

      name: 'rs',
      rules: [
        {type: 'rule', loc: 15, name: 'r1'},
        {type: 'rule', loc: 28, name: 'r2'}
      ]
    }
  ]);

  t.end();
});

test('parser - rule body', function(t){
  var asertRuleAST = function(rule_body_src, ast){
    var src = '';
    src += 'ruleset rs {\n';
    src += '  rule r1 {\n';
    src += rule_body_src + '\n';
    src += '  }\n';
    src += '}';
    t.deepEquals(rmLoc(parser(src)[0].rules[0]), ast);
  }; 

  var src = '';
  asertRuleAST(src, {type: 'rule', name: 'r1'});

  src = 'select when d t';
  asertRuleAST(src, {type: 'rule', name: 'r1', body: [
    {type: 'select_when', body: [
      {type: 'symbol', src: 'd'},
      {type: 'symbol', src: 't'}
    ]}
  ]});

  t.end();
});
