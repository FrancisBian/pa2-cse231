// This is a mashup of tutorials from:
//
// - https://github.com/AssemblyScript/wabt.js/
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

import wabt from 'wabt';
import * as compiler from './compiler';
import {parse} from './parser';

// NOTE(joe): This is a hack to get the CLI Repl to run. WABT registers a global
// uncaught exn handler, and this is not allowed when running the REPL
// (https://nodejs.org/api/repl.html#repl_global_uncaught_exceptions). No reason
// is given for this in the docs page, and I haven't spent time on the domain
// module to figure out what's going on here. It doesn't seem critical for WABT
// to have this support, so we patch it away.
if(typeof process !== "undefined") {
  const oldProcessOn = process.on;
  process.on = (...args : any) : any => {
    if(args[0] === "uncaughtException") { return; }
    else { return oldProcessOn.apply(process, args); }
  };
}

export async function run(source : string, config: any) : Promise<[any, compiler.GlobalEnv]> {
  const wabtInterface = await wabt();
  const parsed = parse(source);
  var returnType = "";
  var returnExpr = "";
  var lastExpr = parsed[parsed.length - 1];
  const compiled = compiler.compile(source, config.env);
  if(lastExpr.tag === "expr" && compiled.last) {
    returnType = "(result i64)";
    returnExpr = "(local.get $$last)";
  }
  const importObject = config.importObject;
  const tb = new WebAssembly.Table({initial:10, element:"anyfunc"});
  if(!importObject.js) {
    const memory = new WebAssembly.Memory({initial:10, maximum:100});
    importObject.js = { memory: memory, tb : tb };
  }
  const wasmSource = `(module
    (func $print (import "imports" "imported_func") (param i64))
    (func $printglobal (import "imports" "print_global_func") (param i32) (param i32))
    (import "js" "memory" (memory 1))
    (import "js" "tb" (table 10 anyfunc))

    ${compiled.types}
    ${compiled.wasmFuncs}

    (func (export "exported_func") ${returnType}
      ${compiled.wasmSource}
      ${returnExpr}
    )
  )`;
  console.log(wasmSource);
  
  const myModule = wabtInterface.parseWat("test.wat", wasmSource);
  var asBinary = myModule.toBinary({});
  var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);
  const result = (wasmModule.instance.exports.exported_func as any)();

  //console.log(tb);
  //console.log(tb.get(0)(BigInt(4)));

  return [result, compiled.newEnv];
}
