import { parser } from "lezer-python";
import { Tree, TreeCursor } from "lezer-tree";
import { Expr, Stmt, Type, Parameter } from "./ast";

export function traverseExpr(c: TreeCursor, s: string): Expr {
  switch (c.type.name) {
    case "Number":
      return {
        tag: "num",
        value: Number(s.substring(c.from, c.to))
      }
    case "UnaryExpression":
      c.firstChild();
      const op = s.substring(c.from, c.to);
      c.nextSibling();
      const operand = traverseExpr(c, s);
      c.parent();
      return {
        tag: "uniop",
        operator: op,
        operand: operand
      }
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }
    case "CallExpression":
      c.firstChild();
      const callName = s.substring(c.from, c.to);
      console.log(callName);
      c.nextSibling(); // go to arglist
      const argList = new Array<Expr>();
      if (s.substring(c.from, c.to).length > 2) {
        c.firstChild();
        while (c.nextSibling()) {
          argList.push(traverseExpr(c, s));
          c.nextSibling();
        }
        c.parent();
      }
      console.log(argList);
      c.parent();
      return {
        tag: "call",
        name: callName,
        arguments: argList
      }
    case "BinaryExpression":
      c.firstChild();
      const operand1 = traverseExpr(c, s);
      c.nextSibling();
      const operator = s.substring(c.from, c.to);
      c.nextSibling();
      const operand2 = traverseExpr(c, s);
      c.parent();
      return {
        tag: "binop",
        operand1: operand1,
        operator: operator,
        operand2: operand2
      }
    case "Boolean":
      return {
        tag: "bool",
        value: s.substring(c.from, c.to) == "True" ? true : false,
      }
    case "None":
      return {
        tag: "none"
      }
    default:
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseDecl(c: TreeCursor, s: string, name: string): Stmt {
  const typeStr = s.substring(c.from + 1, c.to);
  c.nextSibling();
  c.nextSibling();
  const value = traverseExpr(c, s);
  c.parent();
  return {
    tag: "init",
    name: name,
    type: typeStr == "int" ? Type.int : (typeStr == "bool" ? Type.bool : Type.none),
    value: value
  }
}

export function traverseStmt(c: TreeCursor, s: string): Stmt {
  switch (c.node.type.name) {
    case "AssignStatement":
      c.firstChild(); // go to name
      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to equals
      if (s.substring(c.from, c.to).startsWith(":")) {
        return traverseDecl(c, s, name)
      }

      c.nextSibling(); // go to value
      const value = traverseExpr(c, s);
      c.parent();
      return {
        tag: "assign",
        name: name,
        value: value
      }
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr }
    case "IfStatement":
      c.firstChild();
      c.nextSibling();
      const ifcond = traverseExpr(c, s);
      c.nextSibling();
      c.firstChild();
      const ifthen = new Array<Stmt>();
      const elifthen = new Array<Stmt>();
      const els = new Array<Stmt>();
      let hasElse = false;
      let elifcond = null;
      while (c.nextSibling()) ifthen.push(traverseStmt(c, s));
      c.parent();
      if (c.nextSibling() && s.substring(c.from, c.to) == "elif") {
        c.nextSibling();
        elifcond = traverseExpr(c, s);
        c.nextSibling();
        c.firstChild();
        while (c.nextSibling()) elifthen.push(traverseStmt(c, s));
        c.parent();
      }
      if (c.nextSibling()) {
        hasElse = true;
        c.nextSibling();
        c.firstChild();
        while (c.nextSibling()) els.push(traverseStmt(c, s));
        c.parent();
      }
      c.parent();
      return {
        tag: "if",
        ifcond: ifcond,
        ifthen: ifthen,
        elifcond: elifcond,
        elifthen: elifthen,
        elscond: hasElse,
        els: els
      }
    
    case "WhileStatement":
      c.firstChild(); // go to name
      c.nextSibling(); // go to equals
      const whileCond = traverseExpr(c, s);
      c.nextSibling(); // go to equals
      c.firstChild();
      const whileBody = new Array<Stmt>();
      while (c.nextSibling()) whileBody.push(traverseStmt(c, s));
      c.parent();
      c.parent();
      return {
        tag: "while",
        cond: whileCond,
        body: whileBody
      } 
    case "PassStatement":
      return { tag: "pass" }
    case "FunctionDefinition":
      c.firstChild();
      c.nextSibling();
      var funcName = s.substring(c.from, c.to);
      c.nextSibling();

      var params = s.substring(c.from, c.to).slice(1, -1).split(",")
        .map(item => ({
          name: item.trim().split(":")[0],
          type: item.trim().split(":")[1] == "int" ? Type.int : (item.trim().split(":")[1] == "bool" ? Type.bool : Type.none)
        }
        ));
      console.log(params);
      c.nextSibling();
      var ret = Type.none;
      var retStrs = s.substring(c.from, c.to).split("->");
      if (retStrs.length > 1) {
        var retStr = retStrs[1].trim();
        ret = retStr == "int" ? Type.int : (retStr == "bool" ? Type.bool : Type.none);
      }
      c.nextSibling();
      c.firstChild();
      var funcBody = new Array<Stmt>();
      while (c.nextSibling()) funcBody.push(traverseStmt(c, s));      
      c.parent();
      c.parent();
      console.log("Name: " + funcName + ", Params: " + params + ", Return type: " + ret);
      return {
        tag: "define",
        name: funcName,
        parameters: params,
        ret: ret,
        body: funcBody
      }
      
    case "ReturnStatement":
      c.firstChild();
      c.nextSibling();
      var val = null;
      if (s.substring(c.from, c.to).length != 0) val = traverseExpr(c, s);
      c.parent();
      return {
        tag: "return",
        value: val
      }
    
    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverse(c: TreeCursor, s: string): Array<Stmt> {
  switch (c.node.type.name) {
    case "Script":
      const stmts = [];
      const firstChild = c.firstChild();
      do {
        stmts.push(traverseStmt(c, s));
      } while (c.nextSibling())
      return stmts;
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}
export function parse(source: string): Array<Stmt> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}
