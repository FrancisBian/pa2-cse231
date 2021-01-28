export type Stmt = 
  { tag: "assign", name: string, value: Expr }
| { tag: "expr", expr: Expr }
| { tag: "return", value: Expr }
| { tag: "define", name: string, parameters: Array<Parameter>, ret: Type, body: Array<Stmt> }
| { tag: "init", name: string, type: Type, value: Expr}
| { tag: "pass"}
| { tag: "while", cond: Expr, body: Array<Stmt>}
| { tag: "if", ifcond: Expr, ifthen: Array<Stmt>, elifcond: Expr, elifthen: Array<Stmt>, elscond: boolean, els: Array<Stmt> }
| { tag: "globals"}

export type Expr = 
  { tag: "num", value: number }
| { tag: "id", name: string }  
| { tag: "binop", operand1: Expr, operator: string, operand2: Expr }
| { tag: "uniop", operator: string, operand: Expr}
| { tag: "builtin1", name: string, arg: Expr }
| { tag: "builtin2", name: string, arg1: Expr, arg2: Expr }
| { tag: "call", name: string, arguments: Array<Expr> }
| { tag: "bool", value: boolean }
| { tag: "none"}

export enum Type {
  int = "int",
  bool = "bool",
  none = "none",
  any = "any"
}

export type Parameter = { name: string, type: Type };
