import {run} from "./runner";
import {emptyEnv, GlobalEnv} from "./compiler";
import {BasicREPL} from "./repl";

const importObject = {
  imports: {
    imported_func: (arg : any) => {
      console.log("Logging from WASM: ", arg);
    },

    print_global_func: (pos: number, value: number) => {
      var name = importObject.nameMap[pos];
      console.log(name, "=", value);
    },

    // print_globals_func: () => {
    //   var env : GlobalEnv = (importObject as any).env;
    //   env.globals.forEach((pos, name) => {
    //     var value = new Uint32Array((importObject as any).js.memory.buffer)[pos];
    //     console.log(name, "=", value);
    //   });
    // }
  },

  nameMap: new Array<string>(),

  updateNameMap : (env : GlobalEnv) => {
    env.globals.forEach((pos, name) => {
      importObject.nameMap[pos.offset] = name;
    })
  }
};

async function nodeStart(source : string) {
  const env = emptyEnv;
  run(source, { importObject, env });
}

nodeStart("x = 5\nprint(x)");
nodeStart("y = 10\nprint(y)");


async function tryRepl() {
  const r = new BasicREPL(importObject);
  await r.run("foo = 1000");
  await r.run("print(foo)");
  await r.run("bar = 99");
  await r.run("foo = 50");
  await r.run("print(bar)");
  await r.run("print(bar)");
  await r.run("print(foo)");
  await r.run("print(bar)");
  await r.run("globals()");
}
tryRepl();