import { Stmt, Expr, Type, Parameter } from "./ast";
import { emptyEnv, GlobalEnv, FuncType } from "./compiler";


export function typeCheck(ast: Stmt[], env: GlobalEnv): boolean {
    ast.forEach((stmt, i) => { if (stmt.tag === "init") tcStmt(stmt, env) });
    const stmts = ast.filter((stmt) => stmt.tag !== "init");
    stmts.forEach((stmt, i) => {
        if (stmt.tag === "define") {
            var paramMap = Array<Type>();
            stmt.parameters.forEach(s => { if (s.type != Type.none) paramMap.push(s.type) });
            env.funcs.set(stmt.name, { "paramTypes": paramMap, "retType": stmt.ret, index: 0 });
        }
    });
    stmts.forEach(s => { tcStmt(s, env) });
    return true;
}

function tcStmt(stmt: Stmt, env: GlobalEnv): Type {
    switch (stmt.tag) {
        case "assign":
            if (!env.globals.has(stmt.name)) throw new Error("Not a variable: " + stmt.name);
            const type: Type = tcExpr(stmt.value, env);
            const oriType: Type = env.globals.get(stmt.name).type;
            if (tcExpr(stmt.value, env) != env.globals.get(stmt.name).type) throw new Error("Expected type `" + oriType + "`; got type `" + type + "`");
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
            stmt.body.forEach(st => { if (st.tag == "init") localEnv.delete(st.name) });
            console.log(stmt.parameters);
            stmt.parameters.forEach(param => { localEnv.set(param.name, { offset: 0, type: param.type }) });
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
            if (!env.funcs.has(expr.name)) throw new Error("Not a Function " + expr.name);
            expr.arguments.map(arg => tcExpr(arg, env));
            return env.funcs.get(expr.name).retType;
        case "builtin1":
            return tcExpr(expr.arg, env);
    }
}
