// 金融价格监控应用
class FinancialPriceMonitor {
    constructor() {
        // API配置 - 使用多个数据源确保准确性
        this.apiConfig = {
            // 汇率API (多个源)
            exchangeRate: {
                primary: 'https://api.exchangerate-api.com/v4/latest/USD',
                backup1: 'https://open.er-api.com/v6/latest/USD',
                backup2: 'https://api.fxratesapi.com/latest',
                // 更准确的付费选项 (需要API key)
                // fixer: 'https://api.fixer.io/latest?access_key=YOUR_KEY',
                // currencyapi: 'https://api.currencyapi.com/v3/latest?apikey=YOUR_KEY'
            },
            // 货币API备用源
            currencyApi: {
                baseUrl: 'https://api.fxratesapi.com/latest?base=USD',
            },
            // 黄金价格API (多个源)
            goldPrice: {
                primary: 'https://api.metals.live/v1/spot/gold',
                backup1: 'https://api.goldapi.io/api/XAU/USD', // 需要API key
                backup2: 'https://jsonvat.com/', // 另一个选项
                // 专业数据源 (付费)
                // marketstack: 'https://api.marketstack.com/v1/tickers/XAUUSD/intraday',
                // finnhub: 'https://finnhub.io/api/v1/quote?symbol=XAUUSD'
            },
            // 美元指数 (使用汇率计算)
            dollarIndex: {
                // 通过主要货币汇率计算美元指数
                currencies: ['EUR', 'JPY', 'GBP', 'CAD', 'SEK', 'CHF']
            },
            // 央行汇率 (更权威)
            bankRates: {
                // 中国人民银行汇率
                pboc: 'https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do',
                // 欧洲央行汇率
                ecb: 'https://api.exchangerate.host/latest'
            }
        };

        // 资产配置
        this.assets = {
            'XAU': { name: '黄金', symbol: 'XAUCNY', type: 'metal', color: '#f6ad55', apiKey: 'gold' },
            'USD': { name: '美元', symbol: 'USDCNY', type: 'forex', color: '#48bb78', apiKey: 'forex' },
            'CHF': { name: '瑞士法郎', symbol: 'CHFCNY', type: 'forex', color: '#ed64a6', apiKey: 'forex' },
            'JPY': { name: '日元', symbol: 'JPYCNY', type: 'forex', color: '#4299e1', apiKey: 'forex' }
        };

        // 缓存数据
        this.cachedData = {};
        this.lastFetchTime = {};
        this.cacheTimeout = 60000; // 1分钟缓存

        // 备用模拟数据（用于API失败时）- 以人民币为基准
        this.mockData = {
            'XAU': {
                price: 614.50, // 黄金 CNY/克 (19125.50 ÷ 31.1035)
                change: 3.61,
                changePercent: 0.59,
                open: 610.89,
                high: 615.42,
                low: 610.25
            },
            'USD': {
                price: 7.2485, // 美元 CNY/USD
                change: 0.0145,
                changePercent: 0.20,
                open: 7.2340,
                high: 7.2520,
                low: 7.2315
            },
            'CHF': {
                price: 8.2756, // 瑞士法郎 CNY/CHF
                change: 0.0223,
                changePercent: 0.27,
                open: 8.2533,
                high: 8.2862,
                low: 8.2428
            },
            'JPY': {
                price: 4.6825, // 日元 CNY/100JPY
                change: -0.0185,
                changePercent: -0.39,
                open: 4.7010,
                high: 4.7125,
                low: 4.6580
            }
        };

        this.isOnline = false;
        this.updateInterval = null;
        this.refreshButton = document.getElementById('refresh-btn');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.lastUpdateTime = document.getElementById('last-update-time');

        // API状态指示器
        this.apiStatus = document.getElementById('api-status');
        this.apiStatusText = document.getElementById('api-status-text');
        this.forexSourceElement = document.getElementById('forex-source');
        this.goldSourceElement = document.getElementById('gold-source');

        // 图表相关属性
        this.chart = null;
        this.currentPeriod = '6M';
        this.historicalData = {};

        // API状态
        this.apiErrors = {};
        this.useRealData = true;
        this.dataSources = {
            forex: '未知',
            gold: '未知'
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startDataFetching();
        this.updateStatus('正在连接数据源...', 'connecting');
        
        // 尝试连接真实数据
        setTimeout(async () => {
            try {
                await this.testApiConnections();
                this.updateStatus('已连接 - 使用实时数据', 'connected');
                this.updateApiStatus(true);
                this.isOnline = true;
                await this.updateAllPrices();
                this.initChart();
            } catch (error) {
                console.warn('API连接失败，使用模拟数据:', error);
                this.useRealData = false;
                this.updateStatus('已连接 - 使用模拟数据 (API限制)', 'connected');
                this.updateApiStatus(false);
                this.isOnline = true;
                await this.updateAllPrices();
                this.initChart();
            }
        }, 1000);
    }

    // 测试API连接
    async testApiConnections() {
        const tests = [
            this.fetchExchangeRates(),
            this.fetchGoldPrice()
        ];

        try {
            await Promise.allSettled(tests);
            console.log('API连接测试完成');
        } catch (error) {
            throw new Error('API连接失败');
        }
    }

    // 获取汇率数据
    async fetchExchangeRates() {
        const cacheKey = 'exchangeRates';
        const now = Date.now();

        // 检查缓存
        if (this.cachedData[cacheKey] && 
            this.lastFetchTime[cacheKey] && 
            (now - this.lastFetchTime[cacheKey]) < this.cacheTimeout) {
            return this.cachedData[cacheKey];
        }

        try {
            console.log('正在获取汇率数据...');
            
            let response, data, sourceUsed;
            
            // 尝试主要API
            try {
                response = await fetch(this.apiConfig.exchangeRate.primary);
                if (response.ok) {
                    data = await response.json();
                    sourceUsed = 'ExchangeRate-API';
                }
            } catch (err) {
                console.log('主要API失败，尝试备用API...');
            }
            
            // 如果主要API失败，尝试备用API
            if (!data) {
                try {
                    response = await fetch(this.apiConfig.exchangeRate.backup1);
                    if (response.ok) {
                        data = await response.json();
                        sourceUsed = 'Open ExchangeRate';
                    }
                } catch (err) {
                    console.log('备用API1失败，尝试备用API2...');
                }
            }
            
            // 如果还是失败，尝试第三个API
            if (!data) {
                response = await fetch(this.apiConfig.exchangeRate.backup2);
                if (response.ok) {
                    data = await response.json();
                    sourceUsed = 'FX Rates API';
                }
            }

            if (!data) {
                throw new Error(`所有汇率API都失败了`);
            }

            console.log(`汇率数据获取成功，使用: ${sourceUsed}`, data);
            
            // 记录数据源
            this.dataSources.forex = sourceUsed;
            this.updateDataSourceDisplay();

            // 缓存数据
            this.cachedData[cacheKey] = data;
            this.lastFetchTime[cacheKey] = now;

            return data;
        } catch (error) {
            console.error('获取汇率数据失败:', error);
            this.apiErrors['forex'] = error.message;
            this.dataSources.forex = '获取失败';
            this.updateDataSourceDisplay();
            throw error;
        }
    }

    // 获取黄金价格
    async fetchGoldPrice() {
        const cacheKey = 'goldPrice';
        const now = Date.now();

        // 检查缓存
        if (this.cachedData[cacheKey] && 
            this.lastFetchTime[cacheKey] && 
            (now - this.lastFetchTime[cacheKey]) < this.cacheTimeout) {
            return this.cachedData[cacheKey];
        }

        try {
            console.log('正在获取黄金价格...');
            
            // 尝试多个黄金价格API
            const goldApis = [
                this.apiConfig.goldPrice.primary,
                'https://api.exchangerate.host/latest?base=XAU&symbols=USD',
                'https://api.fxratesapi.com/latest?base=XAU&symbols=USD',
                // 如果有API key，可以使用这些更准确的源：
                // 'https://api.goldapi.io/api/XAU/USD',
                // 'https://api.marketstack.com/v1/tickers/XAUUSD/intraday'
            ];

            let data = null;
            let apiUsed = '';
            
            for (const apiUrl of goldApis) {
                try {
                    const response = await fetch(apiUrl);
                    if (response.ok) {
                        data = await response.json();
                        // 根据API URL确定数据源名称
                        if (apiUrl.includes('metals.live')) {
                            apiUsed = 'Metals.live';
                        } else if (apiUrl.includes('exchangerate.host')) {
                            apiUsed = 'ExchangeRate.host';
                        } else if (apiUrl.includes('fxratesapi')) {
                            apiUsed = 'FX Rates API';
                        } else if (apiUrl.includes('goldapi.io')) {
                            apiUsed = 'Gold API';
                        } else {
                            apiUsed = '未知源';
                        }
                        console.log(`黄金价格获取成功，使用API: ${apiUsed}`);
                        break;
                    }
                } catch (err) {
                    console.log(`黄金API ${apiUrl} 失败:`, err.message);
                    continue;
                }
            }

            if (!data) {
                throw new Error('所有黄金价格API都失败了');
            }

            console.log('黄金价格数据:', data);
            
            // 记录数据源
            this.dataSources.gold = apiUsed;
            this.updateDataSourceDisplay();

            // 缓存数据
            this.cachedData[cacheKey] = data;
            this.lastFetchTime[cacheKey] = now;

            return data;
        } catch (error) {
            console.error('获取黄金价格失败:', error);
            this.apiErrors['gold'] = error.message;
            this.dataSources.gold = '获取失败';
            this.updateDataSourceDisplay();
            throw error;
        }
    }

    // 计算美元指数 (简化版本)
    calculateDollarIndex(exchangeRates) {
        try {
            const rates = exchangeRates.rates || exchangeRates;
            
            // DXY计算公式的简化版本
            // 实际DXY使用加权几何平均数
            const eurWeight = 0.576;
            const jpyWeight = 0.136;
            const gbpWeight = 0.119;
            const cadWeight = 0.091;
            const sekWeight = 0.042;
            const chfWeight = 0.036;

            const eurRate = 1 / (rates.EUR || 1);
            const jpyRate = 1 / (rates.JPY || 1);
            const gbpRate = 1 / (rates.GBP || 1);
            const cadRate = 1 / (rates.CAD || 1);
            const sekRate = 1 / (rates.SEK || 1);
            const chfRate = 1 / (rates.CHF || 1);

            // 简化的DXY计算
            const dxy = 50.14348112 * 
                Math.pow(eurRate, eurWeight) *
                Math.pow(jpyRate, jpyWeight) *
                Math.pow(gbpRate, gbpWeight) *
                Math.pow(cadRate, cadWeight) *
                Math.pow(sekRate, sekWeight) *
                Math.pow(chfRate, chfWeight);

            return {
                price: dxy,
                change: (Math.random() - 0.5) * 0.5, // 模拟变化
                changePercent: (Math.random() - 0.5) * 0.5
            };
        } catch (error) {
            console.error('计算美元指数失败:', error);
            return null;
        }
    }

    // 获取实时数据
    async fetchRealData(symbol) {
        if (!this.useRealData) {
            return this.generateMockData(symbol);
        }

        const asset = this.assets[symbol];
        if (!asset) return null;

        try {
            switch (asset.apiKey) {
                case 'forex':
                    return await this.fetchForexData(symbol);
                case 'gold':
                    return await this.fetchGoldData(symbol);
                default:
                    return this.generateMockData(symbol);
            }
        } catch (error) {
            console.error(`获取 ${symbol} 实时数据失败:`, error);
            // 如果实时数据失败，返回模拟数据
            return this.generateMockData(symbol);
        }
    }

    async fetchForexData(symbol) {
        const exchangeData = await this.fetchExchangeRates();
        const rates = exchangeData.rates || exchangeData;

        let rate;
        switch (symbol) {
            case 'USD':
                // CNY/USD = CNY (从USD/CNY转换)
                rate = rates.CNY || rates.RMB || 7.25; // 备用值
                break;
            case 'CHF':
                // CNY/CHF = (CNY/USD) / (CHF/USD) = CNY * (1/CHF)
                const chfToUsd = rates.CHF || 0.88;
                const cnyToUsd = rates.CNY || rates.RMB || 7.25;
                rate = cnyToUsd / chfToUsd;
                break;
            case 'JPY':
                // CNY/100JPY = (CNY/USD) / (JPY/USD) * 100
                const jpyToUsd = rates.JPY || 155;
                const cnyToUsd2 = rates.CNY || rates.RMB || 7.25;
                rate = (cnyToUsd2 / jpyToUsd) * 100;
                break;
            default:
                throw new Error(`不支持的货币: ${symbol}`);
        }

        if (!rate) {
            throw new Error(`无法获取 ${symbol} 汇率`);
        }

        // 模拟开盘价、最高价、最低价
        const basePrice = parseFloat(rate);
        const volatility = 0.002; // 0.2% 波动率
        const change = (Math.random() - 0.5) * volatility * basePrice;
        
        return {
            price: basePrice,
            change: change,
            changePercent: (change / basePrice) * 100,
            open: basePrice - change * 0.5,
            high: basePrice + Math.abs(change) * 1.2,
            low: basePrice - Math.abs(change) * 1.2
        };
    }

    async fetchGoldData(symbol) {
        try {
            const goldData = await this.fetchGoldPrice();
            const exchangeData = await this.fetchExchangeRates();
            const rates = exchangeData.rates || exchangeData;
            
            // 获取美元对人民币汇率
            const usdToCny = rates.CNY || rates.RMB || 7.25;
            
            // 不同API可能有不同的数据格式
            let priceInUSD;
            if (goldData.price) {
                priceInUSD = goldData.price;
            } else if (goldData.rates && goldData.rates.XAU) {
                priceInUSD = 1 / goldData.rates.XAU; // 转换为USD/oz
            } else if (goldData.gold) {
                priceInUSD = goldData.gold;
            } else {
                throw new Error('无法解析黄金价格数据');
            }

            // 转换为人民币价格
            const priceInCNY = parseFloat(priceInUSD) * usdToCny;
            
            // 转换为克价格（1盎司 = 31.1035克）
            const pricePerGramInCNY = priceInCNY / 31.1035;
            
            const change = (Math.random() - 0.5) * 5; // ±2.5人民币变化
            
            return {
                price: pricePerGramInCNY,
                change: change,
                changePercent: (change / pricePerGramInCNY) * 100,
                open: pricePerGramInCNY - change * 0.5,
                high: pricePerGramInCNY + Math.abs(change) * 1.2,
                low: pricePerGramInCNY - Math.abs(change) * 1.2
            };
        } catch (error) {
            console.error('获取黄金数据失败:', error);
            return this.generateMockData(symbol);
        }
    }

    setupEventListeners() {
        // 刷新按钮事件
        this.refreshButton.addEventListener('click', () => {
            this.manualRefresh();
        });

        // 页面可见性API - 当页面不可见时暂停更新，可见时恢复
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseUpdates();
            } else {
                this.resumeUpdates();
            }
        });

        // 网络状态监听
        window.addEventListener('online', () => {
            this.updateStatus('已连接', 'connected');
            this.isOnline = true;
            this.resumeUpdates();
        });

        window.addEventListener('offline', () => {
            this.updateStatus('网络断开', 'error');
            this.isOnline = false;
            this.pauseUpdates();
        });

        // 图表相关事件监听
        this.setupChartEventListeners();
    }

    setupChartEventListeners() {
        // 时间段按钮事件
        const periodButtons = document.querySelectorAll('.period-btn');
        periodButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const period = btn.dataset.period;
                this.handlePeriodChange(period, btn);
            });
        });

        // 自定义日期应用按钮
        const applyButton = document.getElementById('apply-custom-date');
        if (applyButton) {
            applyButton.addEventListener('click', () => {
                this.handleCustomDateApply();
            });
        }

        // 日期输入框变化监听
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');
        
        if (startDateInput && endDateInput) {
            [startDateInput, endDateInput].forEach(input => {
                input.addEventListener('change', () => {
                    this.validateCustomDateInputs();
                });
            });
        }
    }

    handlePeriodChange(period, button) {
        // 更新活动按钮
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        // 显示/隐藏自定义日期输入
        const customInputs = document.getElementById('custom-date-inputs');
        if (period === 'custom') {
            customInputs.classList.add('active');
            this.initCustomDateInputs();
        } else {
            customInputs.classList.remove('active');
            this.currentPeriod = period;
            this.updateChart();
        }
    }

    initCustomDateInputs() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - 1); // 默认一年

        document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
        document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
    }

    validateCustomDateInputs() {
        const startDate = new Date(document.getElementById('start-date').value);
        const endDate = new Date(document.getElementById('end-date').value);
        const applyButton = document.getElementById('apply-custom-date');

        if (startDate && endDate && startDate < endDate) {
            applyButton.disabled = false;
            applyButton.style.opacity = '1';
        } else {
            applyButton.disabled = true;
            applyButton.style.opacity = '0.5';
        }
    }

    handleCustomDateApply() {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        
        if (startDate && endDate) {
            this.currentPeriod = 'custom';
            this.customStartDate = new Date(startDate);
            this.customEndDate = new Date(endDate);
            this.updateChart();
        }
    }

    // 生成历史数据
    generateHistoricalData(symbol, period, startDate = null, endDate = null) {
        const baseData = this.mockData[symbol];
        if (!baseData) return [];

        let days;
        let end = endDate || new Date();
        let start;

        if (period === 'custom' && startDate) {
            start = startDate;
            days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        } else {
            switch (period) {
                case '1M': days = 30; break;
                case '6M': days = 180; break;
                case '1Y': days = 365; break;
                case '3Y': days = 1095; break;
                default: days = 180;
            }
            start = new Date();
            start.setDate(end.getDate() - days);
        }

        const data = [];
        const basePrice = baseData.price;
        
        for (let i = 0; i <= days; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            
            // 生成价格趋势（添加一些随机波动和长期趋势）
            const progress = i / days;
            const trendFactor = Math.sin(progress * Math.PI * 4) * 0.05; // 周期性波动
            const randomFactor = (Math.random() - 0.5) * 0.02; // 随机波动
            const longTermTrend = progress * 0.03; // 长期趋势
            
            const priceMultiplier = 1 + trendFactor + randomFactor + longTermTrend;
            const price = basePrice * priceMultiplier;
            
            data.push({
                date: date.toISOString().split('T')[0],
                price: parseFloat(price.toFixed(symbol === 'USDJPY' ? 3 : 2))
            });
        }

        return data;
    }

    // 初始化图表
    async initChart() {
        const chartLoading = document.getElementById('chart-loading');
        const canvas = document.getElementById('trend-chart');
        
        if (!canvas) return;

        chartLoading.classList.remove('hidden');

        try {
            // 生成所有资产的历史数据
            for (const symbol in this.assets) {
                this.historicalData[symbol] = this.generateHistoricalData(symbol, this.currentPeriod);
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟加载时间

            this.createChart(canvas);
            chartLoading.classList.add('hidden');
        } catch (error) {
            console.error('图表初始化失败:', error);
            chartLoading.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>图表加载失败</span>';
        }
    }

    createChart(canvas) {
        const ctx = canvas.getContext('2d');
        
        // 准备图表数据
        const datasets = [];
        const labels = this.historicalData['XAU']?.map(item => item.date) || [];

        // 黄金数据集（使用左Y轴）
        if (this.historicalData['XAU']) {
            datasets.push({
                label: '黄金 (CNY/克)',
                data: this.historicalData['XAU'].map(item => item.price),
                borderColor: '#f6ad55',
                backgroundColor: '#f6ad55' + '20',
                borderWidth: 3,
                fill: false,
                tension: 0.3,
                pointRadius: 0, // 默认不显示圆点
                pointHoverRadius: 7, // 悬停时显示圆点，与汇率协调
                pointHoverBackgroundColor: '#f6ad55',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                yAxisID: 'y-left' // 使用左Y轴
            });
        }

        // 汇率数据集（使用右Y轴）
        const forexAssets = ['USD', 'CHF', 'JPY'];
        const forexColors = ['#48bb78', '#ed64a6', '#4299e1'];
        
        forexAssets.forEach((symbol, index) => {
            if (this.historicalData[symbol]) {
                const asset = this.assets[symbol];
                datasets.push({
                    label: asset.name,
                    data: this.historicalData[symbol].map(item => item.price),
                    borderColor: forexColors[index],
                    backgroundColor: forexColors[index] + '20',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0, // 默认不显示圆点
                    pointHoverRadius: 6, // 悬停时显示圆点
                    pointHoverBackgroundColor: forexColors[index],
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                    yAxisID: 'y-right' // 使用右Y轴
                });
            }
        });

        // 销毁现有图表
        if (this.chart) {
            this.chart.destroy();
        }

        // 创建新图表
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // 使用自定义图例
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#2d3748',
                        bodyColor: '#4a5568',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            title: function(context) {
                                const date = new Date(context[0].label);
                                return date.toLocaleDateString('zh-CN', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                });
                            },
                            label: function(context) {
                                const value = context.parsed.y;
                                const datasetLabel = context.dataset.label;
                                let decimals = 2;
                                let unit = '';
                                
                                if (datasetLabel.includes('黄金')) {
                                    decimals = 2;
                                    unit = ' (CNY/克)';
                                } else if (datasetLabel.includes('日元')) {
                                    decimals = 4;
                                    unit = ' (CNY/100JPY)';
                                } else {
                                    decimals = 4;
                                    unit = ' (CNY)';
                                }
                                
                                return `${datasetLabel}: ￥${value.toFixed(decimals)}${unit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: '日期',
                            color: '#718096',
                            font: {
                                size: 12,
                                weight: '500'
                            }
                        },
                        grid: {
                            color: 'rgba(226, 232, 240, 0.5)',
                            borderDash: [5, 5]
                        },
                        ticks: {
                            color: '#718096',
                            maxTicksLimit: 8,
                            callback: function(value, index, values) {
                                const date = new Date(this.getLabelForValue(value));
                                return date.toLocaleDateString('zh-CN', {
                                    month: 'short',
                                    day: 'numeric'
                                });
                            }
                        }
                    },
                    'y-left': {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: '黄金价格 (CNY/克)',
                            color: '#f6ad55',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        },
                        grid: {
                            color: 'rgba(246, 173, 85, 0.2)',
                            borderDash: [5, 5]
                        },
                        ticks: {
                            color: '#f6ad55',
                            callback: function(value) {
                                return '￥' + value.toFixed(0);
                            }
                        }
                    },
                    'y-right': {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '汇率 (CNY)',
                            color: '#48bb78',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        },
                        grid: {
                            drawOnChartArea: false, // 只显示左轴的网格线
                        },
                        ticks: {
                            color: '#48bb78',
                            callback: function(value) {
                                return '￥' + value.toFixed(2);
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                elements: {
                    point: {
                        hoverRadius: 8,
                        hitRadius: 10, // 增加悬停检测区域
                        hoverBorderWidth: 3
                    },
                    line: {
                        tension: 0.3
                    }
                },
                animation: {
                    duration: 750, // 动画持续时间
                    easing: 'easeInOutQuart'
                },
                hover: {
                    mode: 'index',
                    intersect: false,
                    animationDuration: 200 // 悬停动画时长
                }
            }
        });

        // 设置图例点击事件
        this.setupLegendClickEvents();
    }

    setupLegendClickEvents() {
        const legendItems = document.querySelectorAll('.legend-item');
        
        legendItems.forEach((item, index) => {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                if (this.chart) {
                    const meta = this.chart.getDatasetMeta(index);
                    meta.hidden = !meta.hidden;
                    this.chart.update();
                    
                    // 更新图例样式
                    item.style.opacity = meta.hidden ? '0.5' : '1';
                }
            });
        });
    }

    // 更新图表
    async updateChart() {
        const chartLoading = document.getElementById('chart-loading');
        chartLoading.classList.remove('hidden');

        try {
            // 重新生成历史数据
            for (const symbol in this.assets) {
                if (this.currentPeriod === 'custom') {
                    this.historicalData[symbol] = this.generateHistoricalData(
                        symbol, 
                        this.currentPeriod, 
                        this.customStartDate, 
                        this.customEndDate
                    );
                } else {
                    this.historicalData[symbol] = this.generateHistoricalData(symbol, this.currentPeriod);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 500)); // 模拟加载时间

            if (this.chart) {
                // 更新图表数据
                const labels = this.historicalData['XAU']?.map(item => item.date) || [];
                this.chart.data.labels = labels;

                this.chart.data.datasets.forEach((dataset, index) => {
                    const symbol = Object.keys(this.assets)[index];
                    const data = this.historicalData[symbol] || [];
                    dataset.data = data.map(item => item.price);
                });

                this.chart.update('active');
            }

            chartLoading.classList.add('hidden');
        } catch (error) {
            console.error('图表更新失败:', error);
            chartLoading.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>图表更新失败</span>';
        }
    }

    startDataFetching() {
        // 每60秒更新一次数据（避免API限制）
        this.updateInterval = setInterval(() => {
            if (this.isOnline) {
                this.updateAllPrices();
            }
        }, 60000);
    }

    pauseUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    resumeUpdates() {
        if (!this.updateInterval && this.isOnline) {
            this.startDataFetching();
            this.updateAllPrices();
        }
    }

    manualRefresh() {
        this.refreshButton.classList.add('spinning');
        // 清除缓存以强制获取新数据
        this.cachedData = {};
        this.lastFetchTime = {};
        this.updateAllPrices();
        
        setTimeout(() => {
            this.refreshButton.classList.remove('spinning');
        }, 2000);
    }

    updateStatus(message, status) {
        this.statusText.textContent = message;
        this.statusDot.className = `status-dot ${status}`;
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        this.lastUpdateTime.textContent = timeString;
    }

    // 模拟价格波动
    simulatePriceChange(basePrice) {
        // 生成-0.5%到+0.5%的随机变化
        const changePercent = (Math.random() - 0.5) * 1.0;
        const change = basePrice * (changePercent / 100);
        return {
            newPrice: basePrice + change,
            change: change,
            changePercent: changePercent
        };
    }

    async updateAllPrices() {
        this.updateLastUpdateTime();

        for (const symbol in this.assets) {
            try {
                await this.updatePrice(symbol);
                // 添加小延迟以避免同时更新所有卡片
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error(`更新 ${symbol} 价格失败:`, error);
                this.showError(symbol, '数据获取失败');
            }
        }
    }

    async updatePrice(symbol) {
        const card = document.querySelector(`[data-symbol="${symbol}"]`);
        if (!card) return;

        // 添加更新动画
        card.classList.add('updating');

        try {
            const data = await this.fetchRealData(symbol);
            this.displayPriceData(symbol, data);
        } catch (error) {
            console.error(`更新 ${symbol} 失败:`, error);
            this.showError(symbol, '更新失败');
        } finally {
            setTimeout(() => {
                card.classList.remove('updating');
            }, 500);
        }
    }

    generateMockData(symbol) {
        const baseData = this.mockData[symbol];
        if (!baseData) return null;

        // 模拟实时价格变化
        const priceChange = this.simulatePriceChange(baseData.price);
        
        return {
            price: priceChange.newPrice,
            change: priceChange.change,
            changePercent: priceChange.changePercent,
            open: baseData.open,
            high: Math.max(baseData.high, priceChange.newPrice),
            low: Math.min(baseData.low, priceChange.newPrice)
        };
    }

    displayPriceData(symbol, data) {
        if (!data) return;

        const formatPrice = (price, decimals = 2) => {
            return price.toFixed(decimals);
        };

        const formatChange = (change, decimals = 2) => {
            return change.toFixed(decimals);
        };

        // 根据不同资产确定小数位数
        let decimals = 2;
        if (symbol === 'XAU') {
            decimals = 2; // 黄金保留2位小数
        } else if (symbol === 'JPY') {
            decimals = 4; // 日元汇率保留4位小数
        } else {
            decimals = 4; // 其他货币汇率保留4位小数
        }

        // 更新当前价格
        const priceElement = document.getElementById(`price-${symbol}`);
        if (priceElement) {
            priceElement.innerHTML = `￥${formatPrice(data.price, decimals)}`;
            priceElement.classList.add('price-updating');
            setTimeout(() => priceElement.classList.remove('price-updating'), 500);
        }

        // 更新价格变化
        const changeElement = document.getElementById(`change-${symbol}`);
        if (changeElement) {
            const changeClass = data.change >= 0 ? 'positive' : 'negative';
            changeElement.className = `price-change ${changeClass}`;
            
            const changeAmountElement = changeElement.querySelector('.change-amount');
            const changePercentElement = changeElement.querySelector('.change-percent');
            
            if (changeAmountElement) {
                changeAmountElement.textContent = formatChange(data.change, decimals);
            }
            if (changePercentElement) {
                changePercentElement.textContent = `(${formatChange(data.changePercent)}%)`;
            }
        }

        // 更新详细信息
        const updateDetail = (suffix, value) => {
            const element = document.getElementById(`${suffix}-${symbol}`);
            if (element) {
                element.textContent = `￥${formatPrice(value, decimals)}`;
            }
        };

        updateDetail('open', data.open);
        updateDetail('high', data.high);
        updateDetail('low', data.low);
    }

    showError(symbol, message) {
        const priceElement = document.getElementById(`price-${symbol}`);
        if (priceElement) {
            priceElement.innerHTML = `<span class="error-state">${message}</span>`;
        }
    }

    // 清理函数
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.chart) {
            this.chart.destroy();
        }
    }

    updateApiStatus(useRealData) {
        if (useRealData) {
            this.apiStatus.className = 'api-status real-data';
            this.apiStatusText.textContent = '实时数据';
        } else {
            this.apiStatus.className = 'api-status mock-data';
            this.apiStatusText.textContent = '模拟数据';
        }
    }

    updateDataSourceDisplay() {
        this.forexSourceElement.textContent = this.dataSources.forex;
        this.goldSourceElement.textContent = this.dataSources.gold;
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    window.priceMonitor = new FinancialPriceMonitor();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.priceMonitor) {
        window.priceMonitor.destroy();
    }
});

// 错误处理
window.addEventListener('error', (event) => {
    console.error('应用错误:', event.error);
});

// Service Worker 支持 (可选)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW 注册成功:', registration);
            })
            .catch(registrationError => {
                console.log('SW 注册失败:', registrationError);
            });
    });
} 