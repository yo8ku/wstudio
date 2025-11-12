# 测试 Markdown 渲染

这是一个测试文件，用于验证 AI Panel 的 Markdown 渲染功能是否正常工作。

## 测试内容

### 1. 文本格式化

这是**粗体文本**，这是*斜体文本*，这是~~删除线~~。

### 2. 代码块测试

```javascript
// 这是一个 JavaScript 代码块
const greeting = "Hello, World!";
console.log(greeting);

function add(a, b) {
  return a + b;
}
```

```python
# 这是一个 Python 代码块
def greet(name):
    print(f"Hello, {name}!")

greet("World")
```

### 3. 行内代码

使用 `const` 关键字声明常量，使用 `let` 声明变量。

### 4. 列表

- 项目 1
- 项目 2
  - 子项目 2.1
  - 子项目 2.2
- 项目 3

### 5. 链接

访问 [Google](https://www.google.com) 搜索信息。

### 6. 引用

> 这是一段引用文本。
> 可以有多行。

## 使用方法

1. 在 AI Chat Panel 中发送消息
2. AI 返回包含 Markdown 格式的响应
3. 检查是否正确渲染：
   - ✅ 标题应该有不同大小
   - ✅ 代码块应该有语法高亮
   - ✅ 行内代码应该有背景色
   - ✅ 链接应该是蓝色可点击




