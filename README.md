# JSFlowRun
JavaScript code to flowchart and run

# Library
- `Graphviz, viz.js`
- `Flowchert Script, flowchart.js`
- `Marmaid JS`

# Syntax of codes

## 1. Simple For Loop

```javascript
for (let i = 1; i <= 5; i++) {
  console.log("Iteration:", i);
}
```

## 2. If-Else Condition

```javascript
let age = prompt("Enter your age:");
if (age >= 18) {
  console.log("Adult");
} else {
  console.log("Minor");
}
```

## 3. While Loop with Break

```javascript
let n = 1;
while (true) {
  console.log(n);
  n++;
  if (n > 10) {
    break;
  }
}
```

## 4. For Loop with Continue

```javascript
for (let i = 1; i <= 10; i++) {
  if (i % 2 === 0) {
    continue;
  }
  console.log(i);
}
```

## 5. Function with Return

```javascript
function sum(a, b) {
  return a + b;
}

let result = sum(5, 7);
console.log("Sum:", result);
```

**`Recursive Factorial`**
```javascript

function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

console.log(factorial(5));
```

`Find out Index of Specific Number`

```javascript
function find_it(list, target, k) {
    if (k == list.length) {
        return "Not found";
    }

    if (list[k] == target) {
        return "Found! Index: " +"["+ k+"]";
    }

    return find_it(list, target, k + 1);
}

let my_list = [10, 20, 30, 40, 50];
console.log(find_it(my_list, 30, k = 0));




```

## 6. Array Iteration

```javascript
const fruits = ["Apple", "Banana", "Cherry"];

for (let i = 0; i < fruits.length; i++) {
  console.log(fruits[i]);
}
```

## 7. Object Manipulation

```javascript
const person = { name: "Alice", age: 25 };
console.log(person.name);
person.age += 1;
console.log(person.age);
```

## 8. Switch Statement

```javascript
const day = "Monday";
switch(day) {
  case "Monday":
    console.log("Start of week");
    break;
  case "Friday":
    console.log("End of week");
    break;
  default:
    console.log("Midweek");
}
```

## 9. Prompt and Alert (I/O Example)

```javascript
let userName = prompt("Enter your name:");
alert("Hello, " + userName + "!");
console.log("Hello, " + userName + "!");
```

## 10. Nested Loops

```javascript
for (let i = 1; i <= 3; i++) {
  for (let j = 1; j <= 2; j++) {
    console.log(`i=${i}, j=${j}`);
  }
}
```
```javascript
const fruits = [
  { name: "Apple", price: 300 },
  { name: "Cherry", price: 250 },
  { name: "Mango", price: 200}
];

let input = prompt("Enter Fruit Name(Apple/Cherry/Mango):");
let qty = prompt("How much weight(kg)?:");

let item = fruits.find(f => f.name.toLowerCase() === input.toLowerCase());

if (item) {
  console.log(`Total: ${item.price * qty} BDT`);
} else {
  console.log("Not found");
}

```

---

If you want, you can use own **examples**, including more advanced scenarios like nested conditionals, nested loops with break/continue, arrays of objects, function calls within loops, and try-catch blocks - all ready to generate flowcharts perfectly.

