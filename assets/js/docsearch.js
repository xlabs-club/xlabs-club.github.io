import docsearch from '@docsearch/js';

docsearch({
    container: '#docsearch',
    appId: 'PZEX39DGD3',
    indexName: 'xlabs',
    apiKey: '02ab978c596c66c08a026d4ea190a108',
    insights: true
});

const onClick = function () {
    document.getElementsByClassName('DocSearch-Button')[0].click();
};

document.getElementById('searchToggleMobile').onclick = onClick;
document.getElementById('searchToggleDesktop').onclick = onClick;
