import { Bench } from "tinybench";
import { createClient } from "../dist/index.js";
import axios from "axios";

const client = createClient();

const bench = new Bench({ time: 5000 });

bench
    .add("native fetch (real)", async () => {
        await fetch("https://jsonplaceholder.typicode.com/posts");
    })
    .add("axios (real)", async () => {
        await axios.get("https://jsonplaceholder.typicode.com/posts");
    })
    .add("solvix minimal (real)", async () => {
        await client.get("https://jsonplaceholder.typicode.com/posts");
    });

await bench.run();

console.log("Benchmark results:", bench.results);

// console.table(
//     bench.tasks.map(task => {
//         const r = task.result as any;
//         return {
//             name: task.name,
//             avgMs: r.period.mean.toFixed(2)
//         };
//     })
// );