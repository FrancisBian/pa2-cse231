import { stringInput } from "lezer-tree";
import { Stmt, Expr, Type, Parameter } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

// Numbers are offsets into global memory
export type GlobalEnv = {
  globals: Map<string, VarInfo>;
  funcs: Map<String, FuncType>;
  offset: number;
  funcIndex: number;
}

export type VarInfo = {
  offset: number,
  type: Type
}

export type FuncType = {
  paramTypes: Array<Type>,
  retType: Type,
  index: number
}

var getLast = false;

export const emptyEnv = { globals: new Map(), funcs: new Map(), offset: 0 };

export function augmentEnv(env: GlobalEnv, stmts: Array<Stmt>): GlobalEnv {
  const newGlobals = new Map(env.globals);
  const newFuncs = new Map(env.funcs);
  var newOffset = env.offset;
  var newFuncIndex = env.funcIndex;
  stmts.forEach((s) => {
    switch (s.tag) {
      case "init":
        if (!newGlobals.has(s.name)) {
          newGlobals.set(s.name, { offset: newOffset, type: s.type });
          newOffset += 1;
        }
        break;
      case "define":
        var paramMap = Array<Type>();
        s.parameters.forEach(s => {
          if (s.type != Type.none) paramMap.push(s.type);
        });
        newFuncs.set(s.name, { "paramTypes": paramMap, "retType": s.ret, index: newFuncIndex });
        newFuncIndex++;
        break;
    }
  })
  return {
    globals: newGlobals,
    funcs: newFuncs,
    offset: newOffset,
    funcIndex: newFuncIndex
  }
}

type CompileResult = {
  wasmFuncs: string,
  wasmSource: string,
  newEnv: GlobalEnv
  last: boolean
  types: string
};

export function compile(source: string, env: GlobalEnv): CompileResult {
  const ast = parse(source);
  const withDefines = augmentEnv(env, ast);

  typeCheck(ast, env);

  console.log(withDefines.funcs);
  // get allfuncs declaration
  const funs: Array<string> = [];
  let elems: Array<string> = [];
  let hasDefine = false;
  ast.forEach((stmt, i) => {
    if (stmt.tag === "define") {
      hasDefine = true;
      funs.push(codeGen(stmt, withDefines).join("\n"));
    }
  });
  // Add (elem ) to newly defined functions
  if (hasDefine) {
    //(elem (i32.const 0) $print $printglobal)
    ast.forEach((stmt, i) => {
      if (stmt.tag === "define") {
        elems.push(`$${stmt.name} `);
      }
    });
    console.log(elems[0].slice(1,-1));
    elems = [`(elem (i32.const ${withDefines.funcs.get(elems[0].slice(1,-1)).index})`].concat(elems).concat([")"]);
  }
  const allFuns = funs.concat(elems.flat()).join("\n\n");

  // add (type) to all global functions
  let typeCode: Array<string> = [];
  withDefines.funcs.forEach((type, name) => {
    //(type $ft (func (param i64)))
    if (name != "print" && name != "globals") {
      var funcInfo = [`(type $${name} (func `];
      type.paramTypes.forEach(paramType => { funcInfo = funcInfo.concat(["(param i64) "]) });
      if (type.retType != Type.none) funcInfo = funcInfo.concat(["(result i64)"]);
      funcInfo = funcInfo.concat(["))"]);
      typeCode.push(funcInfo.flat().join("\n"));
    }
  });


  // remove define
  const stmts = ast.filter((stmt) => stmt.tag !== "define");

  const commandGroups = stmts.map((stmt) => codeGen(stmt, withDefines)).flat();
  const commands = commandGroups;
  return {
    wasmFuncs: allFuns,
    wasmSource: [`(local $$last i64)`].concat(commands).join("\n"),
    newEnv: withDefines,
    last: getLast,
    types: typeCode.join("\n")
  };
}

function envLookup(env: GlobalEnv, name: string): number {
  if (!env.globals.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find name " + name); }
  return (env.globals.get(name).offset * 8); // 4-byte values
}

function funEnvLookup(env: GlobalEnv, name: string): number {
  if (!env.funcs.has(name)) { console.log("Could not find " + name + " in ", env); throw new Error("Could not find function " + name); }
  return (env.funcs.get(name).index); // 4-byte values
}

///////
function typeCheck(ast: Stmt[], env: GlobalEnv): boolean {
  ast.forEach(s => {
    tcStmt(s, env);
  });
  return true;
}

function tcStmt(stmt: Stmt, env: GlobalEnv): Type {

  switch (stmt.tag) {
    case "assign":
      if (!env.globals.has(stmt.name)) throw new Error("Not a variable: " + stmt.name);
      const type: Type = tcExpr(stmt.value, env);
      const oriType: Type = env.globals.get(stmt.name).type;
      console.log(type + " " + oriType);
      if (type != oriType) throw new Error("Expected type `" + oriType + "`; got type `" + type + "`");
      return type;

    case "expr":
      return tcExpr(stmt.expr, env);

    case "init":
      // check dup
      if (env.globals.has(stmt.name)) throw new Error("Duplicate declaration of identifier in same scope: " + stmt.name);
      env.globals.set(stmt.name, { offset: 0, type: stmt.type });
      const assignedType: Type = tcExpr(stmt.value, env);
      // check type
      if (assignedType != stmt.type) {
        throw new Error("Expected type `" + stmt.type + "`; got type `" + assignedType + "`");
      }
      return stmt.type;

    case "if":
      var ifcondType = tcExpr(stmt.ifcond, env);
      if (ifcondType != Type.bool) throw new Error("Condition expression cannot be of type `" + ifcondType + "`");
      if (stmt.ifthen.length == 0) throw new Error("Parse error near token ");
      if (stmt.elifcond != null && tcExpr(stmt.elifcond, env) != Type.bool) throw new Error("Condition expression cannot be of type `" + ifcondType + "`");
      if (stmt.elifcond != null && stmt.elifthen.length == 0) throw new Error("Parse error near token ");
      if (stmt.elscond && stmt.els.length == 0) throw new Error("Parse error near token ");
      stmt.ifthen.map(st => tcStmt(st, env));
      stmt.elifthen.map(st => tcStmt(st, env));
      stmt.els.map(st => tcStmt(st, env));
      return Type.any;
    case "pass":
      return Type.any;
    case "return":
      if (stmt.value == null) return Type.none;
      return tcExpr(stmt.value, env);
    case "while":
      var ifcondType = tcExpr(stmt.cond, env);
      if (ifcondType != Type.bool) throw new Error("Condition expression cannot be of type `" + ifcondType + "`");
      stmt.body.map(st => tcStmt(st, env));
      return Type.any;
    case "define":
      env.funcs.set(stmt.name, { paramTypes: stmt.parameters.map(x => x.type), retType: stmt.ret, index: 0 });
      var localEnv = new Map(env.globals);
      stmt.body.forEach(st => {
        if (st.tag == "init") localEnv.delete(st.name);
      });
      stmt.parameters.forEach(param => {
        localEnv.set(param.name, { offset: 0, type: param.type });
      });
      stmt.body.map(st => tcStmt(st, { globals: localEnv, funcs: env.funcs, offset: env.offset, funcIndex: env.funcIndex }));
      return Type.any;
  }
}

function tcExpr(expr: Expr, env: GlobalEnv): Type {
  //console.log(expr.tag);
  switch (expr.tag) {
    case "num":
      return Type.int;
    case "bool":
      return Type.bool;
    case "id":
      if (!env.globals.has(expr.name)) throw new Error("Not a Variable " + expr.name);
      return env.globals.get(expr.name).type;
    case "none":
      return Type.none;
    case "binop":
      let leftType = tcExpr(expr.operand1, env);
      let rightType = tcExpr(expr.operand2, env);
      switch (expr.operator) {
        case "+":
        case "-":
        case "*":
        case "//":
        case "%":
          if (leftType == rightType && leftType == Type.int) return Type.int;
          else throw new Error("Cannot apply operator `" + expr.operator + "` on types `" + leftType + "` and `" + rightType + "`");
        case "<=":
        case ">=":
        case "<":
        case ">":
          if (leftType == rightType && leftType == Type.int) return Type.bool;
          else throw new Error("Cannot apply operator `" + expr.operator + "` on types `" + leftType + "` and `" + rightType + "`");
        case "==":
        case "!=":
          if (leftType == rightType) return Type.bool;
          else throw new Error("Cannot apply operator `" + expr.operator + "` on types `" + leftType + "` and `" + rightType + "`");
        case "is":
          if (leftType == rightType && leftType == Type.none) return Type.bool;
          else throw new Error("Cannot apply operator `" + expr.operator + "` on types `" + leftType + "` and `" + rightType + "`");
        default: throw new Error("Cannot apply operator `" + expr.operator + "` on types `" + leftType + "` and `" + rightType + "`");
      }
    case "uniop":
      if (expr.operator == "not") {
        if (tcExpr(expr.operand, env) != Type.bool) throw new Error("Cannot apply operator `not` on type `int`");
        return Type.bool;
      }
      else if (expr.operator == "-") {
        if (tcExpr(expr.operand, env) != Type.int) throw new Error("Cannot apply operator `-` on type `bool`");
        return Type.int;
      }
      else throw new Error("Parse error near token: " + expr.operator);
    case "call":
      return Type.none;
    case "builtin1":
      return tcExpr(expr.arg, env);
  }
}

////////
function getIfBodyCode(stmts: Array<Stmt>, env: GlobalEnv): string {
  var ifthen = stmts.map(st => codeGen(st, env));
  var lastStmt = stmts[stmts.length - 1];
  if (lastStmt.tag != "return") ifthen = ifthen.concat(["(i64.const 0)"]);
  return ifthen.flat().join("\n");
}

function codeGen(stmt: Stmt, env: GlobalEnv): Array<string> {
  switch (stmt.tag) {
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, env);
      if (stmt.expr.tag == "call") {
        if (env.funcs.get(stmt.expr.name).retType == Type.none) {
          getLast = false;
          console.log("get void call here");
          return exprStmts;
        }
        getLast = true;
      }
      getLast = true;
      return exprStmts.concat([`(local.set $$last)`]);

    case "init":
      var valStmts = codeGenExpr(stmt.value, env);
      if (!env.globals.has(stmt.name)) {
        return valStmts.concat([`(local.set $${stmt.name})`]);
      }
      var locationToStore = [`(i32.const ${envLookup(env, stmt.name)}) ;; ${stmt.name}`];
      return locationToStore.concat(valStmts).concat([`(i64.store)`]);

    case "assign":
      var valStmts = codeGenExpr(stmt.value, env);
      if (!env.globals.has(stmt.name)) {
        return valStmts.concat([`(local.set $${stmt.name})`]);
      }
      var locationToStore = [`(i32.const ${envLookup(env, stmt.name)}) ;; ${stmt.name}`];
      return locationToStore.concat(valStmts).concat([`(i64.store)`]);

    case "define":
      // body
      var definedVars = new Set<string>();
      var newGlobals = new Map(env.globals); //
      //var localEnv = new Map(env); 
      stmt.body.forEach(s => { if (s.tag === "init") { definedVars.add(s.name); } });
      var scratchVar: string = `(local $$last i64)`;
      var localDefines = [scratchVar];
      definedVars.forEach(v => {
        localDefines.push(`(local $${v} i64)`);
        newGlobals.delete(v); //
      })
      stmt.parameters.forEach(param => { newGlobals.delete(param.name); }); //
      console.log(newGlobals);
      //var stmts = stmt.body.filter((stmt) => stmt.tag !== "define").map(st => codeGen(st, localEnv)).flat();
      var stmts = stmt.body.filter((stmt) => stmt.tag !== "define")
        .map(st => codeGen(st, { globals: newGlobals, funcs: env.funcs, offset: env.offset, funcIndex: env.funcIndex }))
        .flat(); //
      if (stmt.body[stmt.body.length - 1].tag == "if") stmts = stmts.concat("(local.get $$last)");
      var params = stmt.parameters.map(p => p.name == "" ? "" : `(param $${p.name} i64)`).join(" ");
      var ret = stmt.ret == Type.none ? "" : "(result i64)";
      var stmtsBody = localDefines.concat(stmts).join("\n");
      //console.log(`(func $${stmt.name} ${params} ${ret} ${stmtsBody})`);
      return [`(func $${stmt.name} ${params} ${ret} ${stmtsBody})`];
    //return [`(func (export "${stmt.name}") ${params} ${ret} ${stmtsBody})`];

    case "return":
      return (stmt.value == null ? [""] : codeGenExpr(stmt.value, env));

    case "pass":
      break;
    case "if":
      //tag: "if", ifcond: Expr, ifthen: Array<Stmt>, elifcond: Expr, elifthen: Array<Stmt>, elscond: boolean, els: Array<Stmt> }
      var ifcond = codeGenExpr(stmt.ifcond, env);
      ifcond = ["(i32.and "].concat(ifcond).concat(["(i32.wrap/i64)"]).concat(["(i32.const 1))"]);
      //var ifthen = stmt.ifthen.map(st=>codeGen(st,env)).flat().join("\n");
      var ifthen = getIfBodyCode(stmt.ifthen, env);
      var valStmts = [`(if (result i64)`].concat(ifcond).concat([`(then ${ifthen})`]);

      if (stmt.elifcond != null) {
        var elifcond = codeGenExpr(stmt.elifcond, env);
        elifcond = ["(i32.and "].concat(elifcond).concat(["(i32.wrap/i64)"]).concat(["(i32.const 1))"]);
        //var elifthen = stmt.elifthen.map(st=>codeGen(st,env)).flat().join("\n");
        var elifthen = getIfBodyCode(stmt.elifthen, env);
        valStmts = valStmts.concat([`(else `]).concat([`(if (result i64)`])
          .concat(elifcond).concat([`(then ${elifthen})`])
        if (stmt.elscond) {
          //var els = stmt.els.map(st=>codeGen(st,env)).flat().join("\n");
          var els = getIfBodyCode(stmt.els, env);
          valStmts = valStmts.concat([`(else `]).concat(els).concat([`)`]);
        }
        else valStmts = valStmts.concat([`(else (i64.const 0)`]).concat([`)`]);
        valStmts = valStmts.concat([`))`]);
      }
      else if (stmt.elscond) {
        //var els = stmt.els.map(st=>codeGen(st,env)).flat().join("\n");
        var els = getIfBodyCode(stmt.els, env);
        valStmts = valStmts.concat([`(else `]).concat(els).concat([`)`]);
      }
      else valStmts = valStmts.concat([`(else (i64.const 0)`]).concat([`)`]);
      return valStmts.concat([`)`]).concat([`(local.set $$last)`]);

    case "while":
      var whileCond = ["(i32.xor "].concat(codeGenExpr(stmt.cond, env)).concat(["(i32.wrap/i64)"]).concat(["(i32.const 1))"]);
      var whileStmt = ["(block "].concat(["(br_if 0"]).concat(whileCond).concat([")"]).concat(["(loop "]);
      whileStmt = whileStmt.concat(stmt.body.map(st => codeGen(st, env)).flat().join("\n"));
      //whileStmt = whileStmt.concat(["(br_if 1 "]).concat(["(i32.xor "]).concat(whileCond).concat(["(i32.const 1))"]).concat([")"]);
      whileStmt = whileStmt.concat(["(br_if 1 "]).concat(whileCond).concat([")"]);
      whileStmt = whileStmt.concat(["(br 0) ))"])
      return whileStmt;
  }
}

function codeGenExpr(expr: Expr, env: GlobalEnv): Array<string> {
  switch (expr.tag) {
    case "num":
      return ["(i64.const " + expr.value + ")"];
    case "id":
      if (!env.globals.has(expr.name)) return [`(local.get $${expr.name})`];
      return [`(i32.const ${envLookup(env, expr.name)})`, `(i64.load) `]
    case "bool":
      const boolTag = Math.pow(2, 32);
      const boolVal = expr.value ? 1 : 0;
      return ["(i64.const " + (boolTag + boolVal) + ")"];
    case "binop":
      //console.log(expr.operand1.tag + " " + expr.operand2.tag);
      const operator = expr.operator;
      switch (operator) {
        case "+":
          return ["(i64.add "].concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env)).concat([")"]);
        case "-":
          return ["(i64.sub "].concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env)).concat([")"]);
        case "*":
          return ["(i64.mul "].concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env)).concat([")"]);
        case "//":
          return ["(i64.div_s "].concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env)).concat([")"]);
        case "%":
          return ["(i64.rem_s "].concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env)).concat([")"]);
        case "==":
          return ["(i64.add "].concat(["(i64.eq "]).concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env))
            .concat([")"]).concat(["(i64.extend_s/i32)"]).concat(["(i64.const 4294967296)"]).concat([")"]);
        case "!=":
          return ["(i64.add "].concat(["(i64.ne "]).concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env))
            .concat([")"]).concat(["(i64.extend_s/i32)"]).concat(["(i64.const 4294967296)"]).concat([")"]);
        case "<=":
          return ["(i64.add "].concat(["(i64.le_s "]).concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env))
            .concat([")"]).concat(["(i64.extend_s/i32)"]).concat(["(i64.const 4294967296)"]).concat([")"]);
        case ">=":
          return ["(i64.add "].concat(["(i64.ge_s "]).concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env))
            .concat([")"]).concat(["(i64.extend_s/i32)"]).concat(["(i64.const 4294967296)"]).concat([")"]);
        case "<":
          return ["(i64.add "].concat(["(i64.lt_s "]).concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env))
            .concat([")"]).concat(["(i64.extend_s/i32)"]).concat(["(i64.const 4294967296)"]).concat([")"]);
        case ">":
          return ["(i64.add "].concat(["(i64.gt_s "]).concat(codeGenExpr(expr.operand1, env)).concat(codeGenExpr(expr.operand2, env))
            .concat([")"]).concat(["(i64.extend_s/i32)"]).concat(["(i64.const 4294967296)"]).concat([")"]);
        case "is":
          return ["(i64.const 4294967297)"];
      }
      return null;
    case "call":
      if (expr.name == "globals") {
        var globalStmts: Array<string> = [];
        env.globals.forEach((pos, name) => {
          globalStmts.push(
            `(i32.const ${pos.offset})`,
            `(i32.const ${envLookup(env, name)})`,
            `(i32.load)`,
            `(call $printglobal)`
          );
        });
        return globalStmts;
      }
      else if (expr.name == "print") return expr.arguments.map(ex=>codeGenExpr(ex, env)).flat().concat([`(call $${expr.name})`]);
      else {
        return expr.arguments.map(ex => codeGenExpr(ex, env)).flat()
          .concat([`(i32.const ${funEnvLookup(env, expr.name)})`])
          .concat([`(call_indirect (type $${expr.name}))`]);
      }
    case "uniop":
      switch (expr.operator) {
        case "not":
          return ["(i64.xor "].concat(codeGenExpr(expr.operand, env)).concat(["(i64.const 1)"]).concat([")"]);
        case "-":
          return ["(i64.mul "].concat(codeGenExpr(expr.operand, env)).concat(["(i64.const -1)"]).concat([")"]);
      }
  }
}