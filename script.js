/*
    ============================================================
    ALERTA SONORO ACESSÍVEL
    Arquivo: script.js

    Este arquivo:
    1. Solicita acesso ao microfone.
    2. Usa a Web Audio API para analisar o áudio.
    3. Calcula a intensidade do som.
    4. Adapta automaticamente a sensibilidade ao ambiente.
    5. Atualiza os alertas visuais.

    IMPORTANTE:
    O áudio NÃO é gravado, salvo ou enviado para nenhum servidor.
    O processamento acontece somente em tempo real no navegador.
    ============================================================
*/


/* ------------------------------------------------------------
   ELEMENTOS DA PÁGINA
   ------------------------------------------------------------ */

// Área principal do monitor
const monitor = document.getElementById("monitor");

// Ícone que representa o estado atual
const statusIcon = document.getElementById("statusIcon");

// Título do estado atual
const statusTitle = document.getElementById("statusTitle");

// Mensagem explicativa
const statusMessage = document.getElementById("statusMessage");

// Botão do microfone
const microphoneButton =
    document.getElementById("microphoneButton");

// Texto informativo
const microphoneInfo =
    document.getElementById("microphoneInfo");

// Barra preenchida
const meterFill =
    document.getElementById("meterFill");

// Número de 0 a 100
const soundValue =
    document.getElementById("soundValue");

// Elemento que possui role="progressbar"
const meter =
    document.querySelector(".meter");


/* ------------------------------------------------------------
   VARIÁVEIS DA WEB AUDIO API
   ------------------------------------------------------------ */

// Stream recebido do microfone
let microphoneStream = null;

// Contexto de áudio do navegador
let audioContext = null;

// Fonte de áudio ligada ao microfone
let microphoneSource = null;

// Analisador da Web Audio API
let analyser = null;

// Array utilizado para receber os dados do áudio
let dataArray = null;

// Identificador do loop de análise
let animationFrameId = null;


/* ------------------------------------------------------------
   VARIÁVEIS DA SENSIBILIDADE AUTOMÁTICA
   ------------------------------------------------------------ */

/*
    Durante alguns segundos, o programa observa o ruído
    normal do ambiente.

    Depois utiliza essa informação como "linha de base".
*/

let calibrationValues = [];

let baseline = 0;

let isCalibrating = false;

let calibrationStartTime = 0;


/*
    Quanto tempo o sistema observa o ambiente
    antes de estabelecer a referência.

    4 segundos são suficientes para uma demonstração
    em sala de aula.
*/

const CALIBRATION_TIME = 4000;


/*
    Guarda o último valor calculado.
    Isso ajuda a deixar o indicador mais estável.
*/

let smoothedLevel = 0;


/* ------------------------------------------------------------
   INICIAR O MICROFONE
   ------------------------------------------------------------ */

async function startMicrophone() {

    /*
        Verifica se o navegador oferece a API
        getUserMedia.
    */

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

        showError(
            "Seu navegador não permite acesso ao microfone."
        );

        return;
    }


    try {

        /*
            Solicita acesso ao microfone.

            IMPORTANTE:
            Não solicitamos vídeo.

            O navegador mostrará uma janela pedindo
            autorização ao usuário.
        */

        microphoneStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });


        /*
            Cria o contexto de áudio.
        */

        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


        /*
            Cria uma fonte de áudio utilizando
            o microfone autorizado.
        */

        microphoneSource =
            audioContext.createMediaStreamSource(
                microphoneStream
            );


        /*
            Cria o analisador.

            O AnalyserNode permite observar os dados
            do áudio sem precisar gravá-lo.
        */

        analyser =
            audioContext.createAnalyser();


        /*
            FFT_SIZE determina a quantidade de dados
            utilizados na análise.

            Um valor de 1024 é suficiente para este projeto.
        */

        analyser.fftSize = 1024;


        /*
            Quanto maior o smoothingTimeConstant,
            mais suave fica a leitura visual.
        */

        analyser.smoothingTimeConstant = 0.8;


        /*
            Cria um array para receber os valores
            de volume do áudio.
        */

        const bufferLength =
            analyser.fftSize;

        dataArray =
            new Uint8Array(bufferLength);


        /*
            Liga o microfone ao analisador.

            Observe que NÃO conectamos o analisador
            aos alto-falantes.

            Portanto, o som do microfone não é reproduzido
            novamente pelo computador.
        */

        microphoneSource.connect(analyser);


        /*
            Começamos uma nova calibração.
        */

        calibrationValues = [];

        baseline = 0;

        smoothedLevel = 0;

        isCalibrating = true;

        calibrationStartTime =
            performance.now();


        /*
            Atualiza o visual da interface.
        */

        microphoneButton.textContent =
            "⏹️ Desativar Microfone";

        microphoneButton.classList.add("active");

        microphoneInfo.textContent =
            "Calibrando o ruído normal do ambiente...";


        /*
            Inicia o monitoramento contínuo.
        */

        analyseSound();

    } catch (error) {

        /*
            Caso o usuário negue a autorização
            ou aconteça algum outro problema.
        */

        console.error(error);

        showError(
            "Não foi possível acessar o microfone. " +
            "Verifique a permissão do navegador."
        );
    }
}


/* ------------------------------------------------------------
   ANALISAR O SOM
   ------------------------------------------------------------ */

function analyseSound() {

    /*
        Solicita ao navegador que execute esta função
        novamente no próximo quadro da tela.

        Isso cria um monitoramento contínuo.
    */

    animationFrameId =
        requestAnimationFrame(analyseSound);


    /*
        Se o analisador ainda não existir, paramos.
    */

    if (!analyser || !dataArray) {
        return;
    }


    /*
        Coloca no array os valores atuais
        da forma de onda do áudio.

        Os valores ficam entre 0 e 255,
        sendo aproximadamente 128 o ponto central.
    */

    analyser.getByteTimeDomainData(dataArray);


    /*
        Calculamos o RMS (Root Mean Square).

        O RMS é uma maneira de representar
        a energia/intensidade do sinal de áudio.
    */

    let sumSquares = 0;

    for (let i = 0; i < dataArray.length; i++) {

        /*
            Converte o valor de 0-255 para
            aproximadamente -1 até +1.
        */

        const normalized =
            (dataArray[i] - 128) / 128;

        sumSquares +=
            normalized * normalized;
    }


    /*
        Calcula a raiz quadrada da média.
    */

    const rms =
        Math.sqrt(
            sumSquares / dataArray.length
        );


    /*
        Converte o RMS em uma escala percentual.

        O valor ainda será ajustado pela calibração.
    */

    const rawLevel =
        Math.min(100, rms * 250);


    /*
        Durante a calibração, armazenamos os níveis
        observados no ambiente.
    */

    if (isCalibrating) {

        calibrationValues.push(rawLevel);

        const elapsed =
            performance.now() -
            calibrationStartTime;


        /*
            Mostra temporariamente a evolução
            da calibração.
        */

        const calibrationProgress =
            Math.min(
                100,
                (elapsed / CALIBRATION_TIME) * 100
            );


        soundValue.textContent =
            Math.round(calibrationProgress);


        meterFill.style.width =
            `${calibrationProgress}%`;

        meterFill.style.backgroundColor =
            "#2563eb";


        statusIcon.textContent = "👂";

        statusTitle.textContent =
            "Ajustando a sensibilidade...";

        statusMessage.textContent =
            "Observe o ambiente normalmente por alguns segundos.";


        /*
            Quando o tempo de calibração termina,
            calculamos a linha de base.
        */

        if (elapsed >= CALIBRATION_TIME) {

            finishCalibration();
        }

        return;
    }


    /*
        Depois da calibração, comparamos o som atual
        com o nível normal do ambiente.
    */

    updateSoundLevel(rawLevel);
}


/* ------------------------------------------------------------
   FINALIZAR CALIBRAÇÃO
   ------------------------------------------------------------ */

function finishCalibration() {

    isCalibrating = false;


    /*
        Se, por algum motivo, não houver valores,
        utilizamos uma referência padrão.
    */

    if (calibrationValues.length === 0) {

        baseline = 5;

    } else {

        /*
            Calculamos a média dos valores observados.
        */

        const sum =
            calibrationValues.reduce(
                (total, value) => total + value,
                0
            );

        baseline =
            sum / calibrationValues.length;
    }


    /*
        Evitamos uma referência muito próxima de zero.

        Isso ajuda quando o ambiente está extremamente
        silencioso durante a calibração.
    */

    baseline =
        Math.max(baseline, 1);


    microphoneInfo.textContent =
        "Sensibilidade automática ativada. " +
        "O sistema está monitorando o ambiente em tempo real.";


    /*
        Zera o array porque não precisamos mais dele.
    */

    calibrationValues = [];
}


/* ------------------------------------------------------------
   ATUALIZAR O NÍVEL DO SOM
   ------------------------------------------------------------ */

function updateSoundLevel(rawLevel) {

    /*
        Suavização da leitura.

        Isso evita que o indicador fique tremendo
        demais devido a pequenas variações do áudio.
    */

    smoothedLevel =
        (smoothedLevel * 0.75) +
        (rawLevel * 0.25);


    /*
        Calculamos quanto o som atual está acima
        do ruído normal.

        Exemplo:

        baseline = 5
        som atual = 20

        diferença = 15
    */

    const difference =
        Math.max(
            0,
            smoothedLevel - baseline
        );


    /*
        Convertemos essa diferença para 0-100.

        Os multiplicadores abaixo definem a sensibilidade.

        Quanto menor o número, mais facilmente o sistema
        considera um som como alto.
    */

    let visualLevel =
        (difference / 25) * 100;


    /*
        Também levamos em consideração o nível absoluto.

        Isso ajuda a evitar que um ambiente muito silencioso
        faça qualquer pequeno som parecer enorme.
    */

    visualLevel =
        Math.max(
            visualLevel,
            smoothedLevel * 0.45
        );


    /*
        Mantemos o valor dentro de 0-100.
    */

    visualLevel =
        Math.max(
            0,
            Math.min(100, visualLevel)
        );


    /*
        Atualiza a barra e o número.
    */

    updateMeter(visualLevel);


    /*
        Define o estado visual.
    */

    updateState(visualLevel);
}


/* ------------------------------------------------------------
   ATUALIZAR MEDIDOR
   ------------------------------------------------------------ */

function updateMeter(level) {

    const roundedLevel =
        Math.round(level);


    /*
        Altera a largura da barra.
    */

    meterFill.style.width =
        `${roundedLevel}%`;


    /*
        Mostra o número para o usuário.
    */

    soundValue.textContent =
        roundedLevel;


    /*
        Atualiza atributos de acessibilidade
        da barra de progresso.
    */

    meter.setAttribute(
        "aria-valuenow",
        roundedLevel
    );


    /*
        A cor da barra acompanha o estado.
    */

    if (level < 35) {

        meterFill.style.backgroundColor =
            "#16a34a";

    } else if (level < 70) {

        meterFill.style.backgroundColor =
            "#eab308";

    } else {

        meterFill.style.backgroundColor =
            "#dc2626";
    }
}


/* ------------------------------------------------------------
   DEFINIR ESTADO VISUAL
   ------------------------------------------------------------ */

function updateState(level) {

    /*
        Primeiro removemos as classes dos estados anteriores.
    */

    monitor.classList.remove(
        "state-inactive",
        "state-low",
        "state-moderate",
        "state-high"
    );


    /*
        🟢 BAIXO RUÍDO
    */

    if (level < 35) {

        monitor.classList.add("state-low");

        statusIcon.textContent = "😊";

        statusTitle.textContent =
            "🟢 BAIXO RUÍDO";

        statusMessage.textContent =
            "Ambiente tranquilo";

        return;
    }


    /*
        🟡 RUÍDO MODERADO
    */

    if (level < 70) {

        monitor.classList.add("state-moderate");

        statusIcon.textContent = "😟";

        statusTitle.textContent =
            "🟡 RUÍDO MODERADO";

        statusMessage.textContent =
            "Atenção!";

        return;
    }


    /*
        🔴 MUITO BARULHO
    */

    monitor.classList.add("state-high");

    statusIcon.textContent = "😠";

    statusTitle.textContent =
        "🔴 MUITO BARULHO";

    statusMessage.textContent =
        "Muito barulho!";
}


/* ------------------------------------------------------------
   MOSTRAR ERRO
   ------------------------------------------------------------ */

function showError(message) {

    /*
        Coloca a interface em estado de erro/inativo.
    */

    monitor.classList.remove(
        "state-low",
        "state-moderate",
        "state-high"
    );

    monitor.classList.add("state-inactive");


    statusIcon.textContent = "⚠️";

    statusTitle.textContent =
        "Não foi possível ativar";

    statusMessage.textContent =
        message;


    microphoneButton.textContent =
        "🎤 Tentar novamente";


    microphoneButton.classList.remove("active");


    microphoneInfo.textContent =
        "Para utilizar o projeto, permita o acesso ao microfone.";
}


/* ------------------------------------------------------------
   PARAR O MICROFONE
   ------------------------------------------------------------ */

function stopMicrophone() {

    /*
        Para o loop de análise.
    */

    if (animationFrameId !== null) {

        cancelAnimationFrame(
            animationFrameId
        );

        animationFrameId = null;
    }


    /*
        Para todas as faixas do microfone.

        Isso é importante porque libera o acesso
        ao dispositivo físico.
    */

    if (microphoneStream) {

        microphoneStream
            .getTracks()
            .forEach(track => track.stop());

        microphoneStream = null;
    }


    /*
        Fecha o contexto de áudio.
    */

    if (audioContext) {

        audioContext.close();

        audioContext = null;
    }


    /*
        Limpamos as referências.
    */

    microphoneSource = null;

    analyser = null;

    dataArray = null;


    /*
        Restauramos a interface.
    */

    monitor.classList.remove(
        "state-low",
        "state-moderate",
        "state-high"
    );

    monitor.classList.add("state-inactive");


    statusIcon.textContent = "🎤";

    statusTitle.textContent =
        "Microfone desativado";

    statusMessage.textContent =
        "Clique no botão abaixo para começar.";


    microphoneButton.textContent =
        "🎤 Ativar Microfone";

    microphoneButton.classList.remove("active");


    microphoneInfo.textContent =
        "O microfone será usado somente para medir " +
        "a intensidade do som em tempo real.";


    /*
        Zeramos o medidor.
    */

    meterFill.style.width = "0%";

    meterFill.style.backgroundColor =
        "#16a34a";

    soundValue.textContent = "0";

    meter.setAttribute(
        "aria-valuenow",
        "0"
    );


    /*
        Limpamos variáveis de calibração.
    */

    calibrationValues = [];

    baseline = 0;

    smoothedLevel = 0;

    isCalibrating = false;
}


/* ------------------------------------------------------------
   BOTÃO PRINCIPAL
   ------------------------------------------------------------ */

microphoneButton.addEventListener(
    "click",
    async () => {

        /*
            Se já existe um stream ativo,
            o clique desativa o microfone.
        */

        if (microphoneStream) {

            stopMicrophone();

        } else {

            /*
                Caso contrário, iniciamos o microfone.
            */

            await startMicrophone();
        }
    }
);


/* ------------------------------------------------------------
   CUIDADO AO SAIR DA PÁGINA
   ------------------------------------------------------------ */

/*
    Se o usuário fechar/recarregar a página,
    interrompemos o microfone.

    Isso evita deixar a câmera/microfone aberto
    desnecessariamente.
*/

window.addEventListener(
    "beforeunload",
    () => {

        if (microphoneStream) {

            microphoneStream
                .getTracks()
                .forEach(track => track.stop());
        }

        if (audioContext) {

            audioContext.close();
        }
    }
);
