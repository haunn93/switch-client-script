const puppeteer = require('puppeteer');
const fs = require('fs');

require('dotenv').config();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodePassword(password) {
  const visibleChars = password.slice(-3);
  const hiddenChars = '*'.repeat(password.length - 3);
  return hiddenChars + visibleChars;
}

async function checkingNavigateCorrectClient(page, clientName) {
  await page.waitForNavigation({ waitUntil: 'networkidle0' }); // Wait until network is idle

  // Optionally, wait for the .jss36 element to appear
  await page.waitForSelector('.jss36', { timeout: 10000 });

  // Extract the value of the .jss36 element
  const selectedClientName = await page.$eval('.jss36', (element) => element.textContent);

  console.log('Navigated Client Name:', selectedClientName);
  if (selectedClientName !== clientName) {
    throw new Error('Client name does not match');
  }
}

async function login(page, username, password) {
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.type('#username', username);
  await page.click('#next-button');

  await page.waitForSelector('#password', { timeout: 10000 });
  await page.type('#password', password);
  await page.click('#kc-login');
  console.log('Login with username:', username, 'password:', encodePassword(password));
  await page.waitForNavigation();
}

async function selectClient(page, clientListSelector, currentClient = '') {
  await page.waitForSelector(clientListSelector, { timeout: 10000 });
  const parentElement = await page.$(clientListSelector);
  const allClientElements = await parentElement.$$(':scope > div');
  const clientElements = [];
  console.log(`Getting ${allClientElements.length} Clients:`);
  for (const clientElement of allClientElements) {
    const clientName = await clientElement.$eval('h2', (el) => el.textContent);
    if (clientName !== currentClient) {
      clientElements.push(clientElement);
      console.log(' - ', clientName);
    } else {
      console.log(' - ', clientName, ' <---------- Current client');
    }
  }

  const randomIndex = Math.floor(Math.random() * clientElements.length);
  const selectedClient = clientElements[randomIndex];
  const randomSelectedClient = await selectedClient.$eval('h2', (el) => el.textContent);
  console.log('Selected Random Client:', randomSelectedClient);
  await selectedClient.$eval('button[type="button"]', (button) => button.click());
  await checkingNavigateCorrectClient(page, randomSelectedClient);
}

async function selectRandomClientAndSwitch(page) {
  const headerChildCount = await page.$eval(
    '#root > div.MuiGrid-root.MuiGrid-container > div:nth-child(1) > div > header > div',
    (header) => header.childElementCount
  );
  const buttonMenuSelector = `#root > div.MuiGrid-root.MuiGrid-container > div:nth-child(1) > div > header > div > div:nth-child(${headerChildCount}) > button`;
  await page.$eval(buttonMenuSelector, (el) => el.click());
  const switchButtonSelector =
    '#fade-menu > div.MuiPaper-root.MuiMenu-paper.MuiPopover-paper.MuiPaper-elevation8.MuiPaper-rounded > ul > li:nth-child(5)';
  await page.$eval(switchButtonSelector, (el) => el.click());
  const childCount = await page.$eval('body', (body) => body.childElementCount);
  const clientListSelector = `body > div:nth-child(${childCount}) > div:nth-child(3) > div > div:nth-child(5)`;
  const currentClientNameSelector =
    '#root > div.MuiGrid-root.MuiGrid-container > div:nth-child(1) > div > header > div > div > button > span.MuiButton-label > div:nth-child(2) > div:nth-child(2)';
  const currentClient = await page.$eval(
    currentClientNameSelector,
    (element) => element.textContent
  );

  await selectClient(page, clientListSelector, currentClient);
}

async function loginAndGetValue(username, password, loginUrl, loopValue = 1) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null, // Use the default viewport size
    // args: ['--start-maximized'],
  });
  const page = await browser.newPage();

  try {
    await page.goto(loginUrl);
    console.log('------------- Login --------------');
    await login(page, username, password);
    console.log('------------- Login Success --------------');
    // Check for successful login (optional, replace with actual check)
    console.log('------------- Checking multiple Client --------------');
    try {
      await page.waitForSelector('#root > div.jss1.jss2 > div > p', { timeout: 10000 });
      const loginSuccess = await page.$('#root > div.jss1.jss2 > div > p');
      if (!loginSuccess) {
        throw new Error('Login failed');
      }
    } catch (error) {
      throw new Error('This account does not have multiple access clients.');
    }

    console.log('Getting client list...');

    const clientListSelector = '#root > div > div > div:nth-child(4)';
    await selectClient(page, clientListSelector);
    // Switch Client

    for (let i = 0; i < loopValue; i++) {
      console.log(`------------ Loop: ${i + 1} ------------`);
      await selectRandomClientAndSwitch(page);
    }
    console.log(
      `------------- Test successful with ${username} in ${loopValue} times --------------`
    );
  } catch (error) {
    console.error('Error:', error);
    if (error.message.includes('timeout')) {
      console.error('Possible issues:');
      console.error('- Incorrect selectors for login elements or the target element.');
      console.error('- Slow website loading, adjust the timeout or navigation wait.');
      console.error('- Login failure, check your credentials and the login success condition.');
    }
  } finally {
    await browser.close();
  }
}

const main = async () => {
  const data = fs.readFileSync('account.txt', 'utf8');
  const lines = data.split('\n');
  const accounts = lines.map((line) => {
    const [username, password] = line.split('|');
    return { username, password };
  });
  const number = process.argv[2];
  console.log(`🚀 ~ Run script switch client ${number} times for each account`);
  for (const account of accounts) {
    await loginAndGetValue(
      account.username,
      account.password,
      'https://app.dev.compscience.com/',
      number
    );
  }
};

main();
