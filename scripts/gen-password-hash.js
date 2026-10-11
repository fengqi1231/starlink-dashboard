/**
 * 生成 bcrypt 密码哈希，写入 .env 的 ADMIN_PASS_HASH
 * 用法: npm run gen-hash -- 你的密码
 */
'use strict';
const bcrypt = require('bcryptjs');
const pwd = process.argv[2];
if (!pwd) {
  console.log('用法: npm run gen-hash -- 你的密码');
  console.log('输出: 将打印的哈希填入 .env 的 ADMIN_PASS_HASH=');
  process.exit(1);
}
console.log(bcrypt.hashSync(pwd, 10));
