import {BasicREPL} from './repl';
import {emptyEnv, GlobalEnv} from './compiler';
import { output } from './webpack.config';


function webStart() {
  document.addEventListener("DOMContentLoaded", function() {

    var importObject = {
      imports: {
        imported_func: (arg : any) => {
          /*
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          */
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          const checkType = BigInt(arg) / BigInt(Math.pow(2,31));
          if (checkType != BigInt(0)) {
            arg = 1 & Number(arg);
            if (arg == 0) elt.innerText = "False";
            else elt.innerText = "True";
          }
          else elt.innerText = arg;      
        },

        print_global_func: (pos: number, value: number) => {
          var name = importObject.nameMap[pos];
          var msg = name + " = " + value;
          renderResult(msg);
        }
      },
    
      nameMap: new Array<string>(),
    
      updateNameMap : (env : GlobalEnv) => {
        env.globals.forEach((pos, name) => {
          importObject.nameMap[pos.offset] = name;
        })
      }
    };
    const env = emptyEnv;
    var repl = new BasicREPL(importObject);

    function renderResult(result : any) : void {
      if(result === undefined) { console.log("skip"); return; }
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = String(result);
    }

    function renderError(result : any) : void {
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.setAttribute("style", "color: red");
      elt.innerText = String(result);
    }

    function setupRepl() {
      document.getElementById("output").innerHTML = "";
      const replCodeElement = document.getElementById("next-code") as HTMLInputElement;
      replCodeElement.addEventListener("keypress", (e) => {
        if(e.key === "Enter" && !(e.shiftKey)) {
          const output = document.createElement("div");
          const prompt = document.createElement("span");
          prompt.innerText = "»";
          output.appendChild(prompt);
          const elt = document.createElement("input");
          elt.type = "text";
          elt.disabled = true;
          elt.className = "repl-code";
          output.appendChild(elt);
          document.getElementById("output").appendChild(output);
          const source = replCodeElement.value;
          elt.value = source;
          replCodeElement.value = "";
          repl.run(source).then((r) => { renderResult(r); console.log ("run finished") })
              .catch((e) => { renderError(e); console.log("run failed", e) });;
        }
      });
    }


    document.getElementById("run").addEventListener("click", function(e) {
      repl = new BasicREPL(importObject);
      const source = document.getElementById("user-code") as HTMLTextAreaElement;
      setupRepl();
      repl.run(source.value).then((r) => { renderResult(r); console.log ("run finished") })
          .catch((e) => { renderError(e); console.log("run failed", e) });;
    });
  });
}

webStart();
