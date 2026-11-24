# CSES 1640 - Sum of Two Values
- 难度：普及-
- 标签：排序，双指针，哈希表，CS-Guidebook，CSES
- 链接：https://cses.fi/problemset/task/1640
- 时间限制：1000ms
- 内存限制：512MB

## 题目描述
给定长度为 n 的整数数组与目标和 x，要求找出两个不同的下标位置（1-based），使对应元素之和恰好等于 x；若不存在合法组合则输出 IMPOSSIBLE。

## 输入格式
第一行包含两个整数 n 和 x；第二行包含 n 个正整数。

## 输出格式
若存在解，输出两个不同的 1-based 下标（顺序任意）；否则输出 IMPOSSIBLE。

## 提示
推荐将元素与原始下标捆绑成 pair 后排序再使用双指针夹逼，稳定 O(n log n) 且不惧怕哈希冲突卡常；若使用 C++ unordered_map 需注意自定义防 hack 哈希或改用 std::map。

## 样例输入 1
```
4 10
3 8 2 6
```

## 样例输出 1
```
2 3
```
