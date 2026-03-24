# JSFlowRun Examples 
It will be included some examples covering loops, conditionals, arrays/objects, functions, and I/O so you can test all the features of your flowchart.

## 1. Simple For Loop

```javascript
for (let i = 1; i <= 5; i++) {
  console.log("Iteration:", i);
}
```

## 2. If-Else Condition

```javascript
let age = 20;
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
  if (n > 3) {
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

## 6. Array Iteration

```javascript
const fruits = ["Apple", "Banana", "Cherry"];
for (let fruit of fruits) {
  console.log(fruit);
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
```

## 10. Nested Loops

```javascript
for (let i = 1; i <= 3; i++) {
  for (let j = 1; j <= 2; j++) {
    console.log(`i=${i}, j=${j}`);
  }
}
```

---

If you want, I can use own **examples**, including more advanced scenarios like **nested conditionals, nested loops with break/continue, arrays of objects, function calls within loops, and try-catch blocks**—all ready to generate flowcharts perfectly.

