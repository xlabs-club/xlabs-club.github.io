import docsearch from '@docsearch/js';

docsearch({
    container: '#docsearch',
    appId: 'EN95MC8APY',
    indexName: 'xlabs.club',
    apiKey: 'cd973167116e2f2422d784ed19a60512',
    insights: true,
});

const onClick = function () {
    document.getElementsByClassName('DocSearch-Button')[0].click();
}

document.getElementById('searchToggleMobile').onclick = onClick;
document.getElementById('searchToggleDesktop').onclick = onClick;