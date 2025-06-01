#!/bin/bash

# 🚀 实时金融价格监控应用 - 快速部署脚本

echo "🚀 开始部署金融价格监控应用..."

# 检查必要文件
echo "📋 检查文件完整性..."
required_files=("index.html" "styles.css" "script.js")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ 缺少必要文件: $file"
        exit 1
    else
        echo "✅ $file 存在"
    fi
done

# 检查Git状态
if [ ! -d ".git" ]; then
    echo "📦 初始化Git仓库..."
    git init
    git branch -M main
fi

# 添加所有文件
echo "📁 添加文件到Git..."
git add .

# 提交代码
echo "💾 提交代码..."
git commit -m "部署: 实时金融价格监控应用 - $(date '+%Y-%m-%d %H:%M:%S')"

# 提示用户设置远程仓库
echo ""
echo "🔗 接下来需要设置GitHub远程仓库:"
echo "1. 在GitHub创建新的public仓库"
echo "2. 复制仓库URL"
echo "3. 运行以下命令:"
echo ""
echo "   git remote add origin https://github.com/你的用户名/仓库名.git"
echo "   git push -u origin main"
echo ""
echo "4. 在GitHub仓库的Settings → Pages中启用GitHub Pages"
echo "5. 选择main分支作为源"
echo ""

# 检查部署选项
echo "🌐 部署选项:"
echo "1. GitHub Pages (免费) - https://你的用户名.github.io/仓库名"
echo "2. Vercel (免费) - https://vercel.com"
echo "3. Netlify (免费) - https://netlify.com"
echo ""

echo "✨ 部署准备完成！按照上述步骤完成最后的部署。"
echo ""
echo "📖 详细部署指南请查看: 部署指南.md" 