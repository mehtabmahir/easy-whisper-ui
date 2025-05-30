#include "mainwindow.h"
#include "ui_mainwindow.h"
#include <QFile>
#include <QFileInfo>
#include <QMessageBox>
#include <QProcess>
#include <QFileDialog>
#include <QThread>
#include <QTimer>
#include <QMimeData>
#include <QSettings>
#include <Windows.h>

QList<QProcess*> processList;


MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::EasyWhisperUI)
{
    ui->setupUi(this);
    ui->console->setReadOnly(true);

    connect(ui->openFile, &QPushButton::clicked,
            this, &MainWindow::onOpenFileClicked);
    connect(ui->stop, &QPushButton::clicked,
            this, &MainWindow::exitProcesses);
    connect(ui->clear, &QPushButton::clicked,
            this, &MainWindow::clearConsole);

    connect(ui->txtCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        txtFlag = ui->txtCheckbox->isChecked() ? "-otxt" : "";
    });

    connect(ui->srtCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        srtFlag = ui->srtCheckbox->isChecked() ? "-osrt" : "";
    });

    connect(ui->cpuCheckbox, &QCheckBox::toggled, this, [=](bool checked){
        cpuFlag = ui->cpuCheckbox->isChecked() ? "--no-gpu" : "";
    });

    setAcceptDrops(true);
    loadSettings();

    handleBlur();
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::changeEvent(QEvent *event)
{
    QMainWindow::changeEvent(event);

    if (event->type() == QEvent::PaletteChange)
        handleBlur();

}

void MainWindow::handleBlur()
{
    setAttribute(Qt::WA_TranslucentBackground);
    ui->centralwidget->setAttribute(Qt::WA_TranslucentBackground);

    QColor bg = palette().color(QPalette::Window);
    bool isDark = bg.lightness() < 128;

    QString widgetBackground = isDark
                                   ? "background-color: rgba(64, 64, 64, 140); color: white;"  // darker, more transparent
                                   : "background-color: rgba(255, 255, 255, 140); color: black;";  // lighter, more transparent


    ui->openFile->setAttribute(Qt::WA_TranslucentBackground);
    ui->openFile->setStyleSheet(widgetBackground);

    ui->stop->setAttribute(Qt::WA_TranslucentBackground);
    ui->stop->setStyleSheet(widgetBackground);

    ui->clear->setAttribute(Qt::WA_TranslucentBackground);
    ui->clear->setStyleSheet(widgetBackground);

    ui->model->setAttribute(Qt::WA_TranslucentBackground);
    ui->model->setStyleSheet(widgetBackground);

    ui->language->setAttribute(Qt::WA_TranslucentBackground);
    ui->language->setStyleSheet(widgetBackground);

    ui->arguments->setAttribute(Qt::WA_TranslucentBackground);
    ui->arguments->setStyleSheet(widgetBackground);

    ui->console->setAttribute(Qt::WA_TranslucentBackground);
    ui->console->viewport()->setAttribute(Qt::WA_TranslucentBackground);
    ui->console->setStyleSheet(R"(
        QPlainTextEdit {
            background: transparent;
            color: )" + QString(isDark ? "white" : "black") + R"(;
            border: none;
        }
        QScrollBar:vertical {
            background: transparent;
            width: 10px;
            margin: 0;
        }
        QScrollBar::handle:vertical {
            background: rgba(128, 128, 128, 0.4);
            min-height: 20px;
            border-radius: 5px;
        }
        QScrollBar::add-line:vertical,
        QScrollBar::sub-line:vertical {
            height: 0;
        }
        QScrollBar::add-page:vertical,
        QScrollBar::sub-page:vertical {
            background: none;
        }
    )");


    int acrylicColor = isDark
                           ? static_cast<int>(0x44202020)  // 0x44 = ~27% opacity
                           : static_cast<int>(0x44FFFFFF); // lighter and more transparent

    HWND hwnd = reinterpret_cast<HWND>(this->winId());

    struct ACCENTPOLICY {
        int nAccentState;
        int nFlags;
        int nColor;
        int nAnimationId;
    };

    struct WINCOMPATTRDATA {
        int nAttribute;
        PVOID pData;
        ULONG ulDataSize;
    };

    ACCENTPOLICY policy = { 4 /* ACCENT_ENABLE_ACRYLICBLURBEHIND */, 2, acrylicColor, 0 };
    WINCOMPATTRDATA data = { 19, &policy, sizeof(policy) };

    using pSetWindowCompositionAttribute = BOOL(WINAPI *)(HWND, WINCOMPATTRDATA*);
    auto user32 = GetModuleHandleA("user32.dll");
    auto setWindowCompositionAttribute = reinterpret_cast<pSetWindowCompositionAttribute>(
        GetProcAddress(user32, "SetWindowCompositionAttribute"));

    if (setWindowCompositionAttribute) {
        setWindowCompositionAttribute(hwnd, &data);
    }
}


void MainWindow::dragEnterEvent(QDragEnterEvent *event)
{
    if (event->mimeData()->hasUrls())
        event->acceptProposedAction();
}

void MainWindow::dropEvent(QDropEvent *event)
{
    QList<QUrl> urls = event->mimeData()->urls();
    for (const QUrl &url : urls) {
        QString filePath = url.toLocalFile();
        if (!filePath.isEmpty()) {
            fileQueue.enqueue(filePath);
        }
    }

    if (!isProcessing)
        startNextInQueue();
}

void MainWindow::enqueueFilesAndStart(const QStringList &filePaths)
{
    for (const QString &filePath : filePaths) {
        if (!filePath.isEmpty())
            fileQueue.enqueue(filePath);
    }
    if (!isProcessing)
        startNextInQueue();
}

void MainWindow::startNextInQueue()
{
    if (fileQueue.isEmpty()) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    QString nextFile = fileQueue.dequeue();
    processAudioFile(nextFile);
}


void MainWindow::saveSettings()
{
    QSettings settings(QCoreApplication::applicationDirPath() + "/settings.ini", QSettings::IniFormat);
    settings.setValue("model", ui->model->currentIndex());
    settings.setValue("language", ui->language->currentIndex());
    settings.setValue("txtFile", ui->txtCheckbox->isChecked());
    settings.setValue("srtFile", ui->srtCheckbox->isChecked());
    settings.setValue("cpuOnly", ui->cpuCheckbox->isChecked());
    settings.setValue("args", ui->arguments->toPlainText());
}

void MainWindow::loadSettings()
{
    QSettings settings(QCoreApplication::applicationDirPath() + "/settings.ini", QSettings::IniFormat);
    if (settings.value("model").toString() == "")
        ui->model->setCurrentIndex(3);
    else
        ui->model->setCurrentIndex(settings.value("model").toInt());

    ui->language->setCurrentIndex(settings.value("language").toInt());

    if (settings.value("txtFile").toString() == "")
        ui->txtCheckbox->setChecked(true);
    else
        ui->txtCheckbox->setChecked(settings.value("txtFile").toBool());

    ui->srtCheckbox->setChecked(settings.value("srtFile").toBool());
    ui->cpuCheckbox->setChecked(settings.value("cpuOnly").toBool());

    if (settings.value("args").toString() == "")
        ui->arguments->setPlainText("-tp 0.0 -mc 64 -et 3.0");
    else
        ui->arguments->setPlainText(settings.value("args").toString());
}

void MainWindow::onOpenFileClicked()
{
    QStringList filePaths = QFileDialog::getOpenFileNames(
        this,
        tr("Open Audio/Video Files"),
        QString(),
        tr("Audio/Video Files (*.mp3 *.mp4 *.m4a *.mkv *.m4v *.wav *.mov *.avi *.ogg *.flac *.aac *.wma *.opus);;All Files (*)")
        );

    for (const QString &filePath : filePaths) {
        if (!filePath.isEmpty()) {
            fileQueue.enqueue(filePath);
        }
    }

    if (!isProcessing)
        startNextInQueue();
}

void MainWindow::processAudioFile(const QString &inputFilePath)
{
    // 1. Validate input file.
    if (inputFilePath.isEmpty()) {
        ui->console->appendPlainText("No media file specified. Please drag and drop a file or use 'Open With'.");
        return;
    }
    QFileInfo inputInfo(inputFilePath);
    if (!inputInfo.exists()) {
        ui->console->appendPlainText("Error: File not found.");
        return;
    }
    m_filePath = inputInfo.absoluteFilePath();
    ui->console->appendPlainText("Input file: " + m_filePath);

    // 2. Define output filenames.
    QString mp3File = inputInfo.absolutePath() + "/" + inputInfo.completeBaseName() + ".mp3";
    QString outputFile = mp3File + ".txt";

    QString ext = inputInfo.suffix().toLower();

    auto runWhisper = [this, outputFile, mp3File]() {
        // Build the model filename from the combo box.
        QString modelParam = "ggml-" + ui->model->currentText() + ".bin";
        QString exeDir = QCoreApplication::applicationDirPath();
        QString modelPath = exeDir + "/models/" + modelParam;
        QString whisperCliPath = exeDir + "/whisper-cli.exe";

        QString extraArgs = ui->arguments->toPlainText();
        QStringList parsedArgs = QProcess::splitCommand(extraArgs);

        // Build the arguments.
        QStringList whisperArgs;
        whisperArgs << "-m" << modelPath
                    << "-f" << mp3File   // explicitly use the converted MP3 file
                    << txtFlag << srtFlag << cpuFlag
                    << "-l" << ui->language->currentText()
                    << parsedArgs;

        // Log the full command to the console.
        QString commandLine = whisperCliPath + " " + whisperArgs.join(" ");
        ui->console->appendPlainText("Running: " + commandLine);

        // Create and configure the process.
        QProcess *whisperProcess = new QProcess(this);

        processList.append(whisperProcess);

        whisperProcess->setProcessChannelMode(QProcess::MergedChannels);

        // Log all output from the process to the console.
        connect(whisperProcess, &QProcess::readyRead, this, [this, whisperProcess]() {
            QByteArray data = whisperProcess->readAll();
            ui->console->appendPlainText(QString::fromLocal8Bit(data));
        });

        // Log any errors that occur.
        connect(whisperProcess, &QProcess::errorOccurred, this, [this, whisperProcess]() {
            ui->console->appendPlainText("Whisper process error: " + whisperProcess->errorString());
            startNextInQueue();
        });

        // When finished, check the exit code and then open the output file.
        connect(whisperProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [this, outputFile, whisperProcess](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (!ui->txtCheckbox->isChecked())
                        ui->console->appendPlainText("Whisper processing complete.");
                    else if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        ui->console->appendPlainText("Whisper processing complete. Opening file in Notepad.");
                        QTimer::singleShot(2000, [outputFile]() {
                            QProcess::startDetached("notepad.exe", QStringList() << outputFile);
                        });
                    } else {
                        ui->console->appendPlainText("Whisper process failed. Exit code: " + QString::number(exitCode));
                    }
                    whisperProcess->deleteLater();
                    processList.removeOne(whisperProcess);
                    startNextInQueue(); // <- this line starts the next file after current one finishes
                });

        // Start the whisper-cli process.
        whisperProcess->start(whisperCliPath, whisperArgs);

    };

    // Lambda to check and download model (Step 2).
    auto checkAndDownloadModel = [this, runWhisper]() {
        QString modelParam = "ggml-" + ui->model->currentText() + ".bin";
        QString exeDir = QCoreApplication::applicationDirPath();
        QString modelsDir = exeDir + "/models/";
        QDir dir(modelsDir);
        if (!dir.exists() && !dir.mkpath(modelsDir)) {
            ui->console->appendPlainText("Failed to create models directory: " + modelsDir);
            return;
        }
        QString modelPath = modelsDir + modelParam;
        // Use the "resolve" endpoint instead of "raw"
        QString baseUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
        QUrl modelUrl(baseUrl + modelParam);

        if (QFile::exists(modelPath)) {
            ui->console->appendPlainText("Model file exists: " + modelPath);
            runWhisper();
        } else {
            ui->console->appendPlainText("Model file not found: " + modelPath);
            ui->console->appendPlainText("Downloading model from " + modelUrl.toString());
            QProcess *downloadProcess = new QProcess(this);
            processList.append(downloadProcess);
            downloadProcess->setProcessChannelMode(QProcess::MergedChannels);
            QStringList downloadArgs;
            downloadArgs << "-L" << modelUrl.toString() << "-o" << modelPath;
            connect(downloadProcess, &QProcess::readyRead, this, [this, downloadProcess]() {
                ui->console->appendPlainText(QString::fromLocal8Bit(downloadProcess->readAll()));
            });
            connect(downloadProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                    this, [this, modelPath, runWhisper, downloadProcess](int exitCode, QProcess::ExitStatus exitStatus) {
                        if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                            QFileInfo fi(modelPath);
                            // Check file size; if it's unexpectedly small, warn the user.
                            if (fi.size() < 1000000) { // e.g., less than 1MB
                                ui->console->appendPlainText("Downloaded model appears to be too small (" + QString::number(fi.size()) + " bytes).");
                            } else {
                                ui->console->appendPlainText("Model downloaded successfully: " + modelPath);
                                runWhisper();
                            }
                        } else {
                            ui->console->appendPlainText("Failed to download model. Exit code: " + QString::number(exitCode));
                            QFile::remove(modelPath);
                        }
                        downloadProcess->deleteLater();
                        processList.removeOne(downloadProcess);
                    });
            downloadProcess->start("curl", downloadArgs);
        }
    };

    // Step 1: Convert audio if needed.
    if (ext != "mp3") {
        ui->console->appendPlainText("Converting " + m_filePath + " to MP3...");
        QStringList ffmpegArgs;
        ffmpegArgs << "-n" << "-i" << m_filePath << "-q:a" << "2" << mp3File;
        QProcess *ffmpegProcess = new QProcess(this);
        processList.append(ffmpegProcess);
        ffmpegProcess->setProcessChannelMode(QProcess::MergedChannels);
        connect(ffmpegProcess, &QProcess::readyRead, this, [this, ffmpegProcess]() {
            ui->console->appendPlainText(QString::fromLocal8Bit(ffmpegProcess->readAll()));
        });
        connect(ffmpegProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [this, mp3File, ffmpegProcess, checkAndDownloadModel](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        ui->console->appendPlainText("FFmpeg conversion successful.");
                        m_filePath = mp3File;
                        checkAndDownloadModel();
                    } else {
                        ui->console->appendPlainText("FFmpeg conversion failed. Exit code: " + QString::number(exitCode));
                        QFile::remove(mp3File);
                    }
                    ffmpegProcess->deleteLater();
                    processList.removeOne(ffmpegProcess);
                });
        ffmpegProcess->start("ffmpeg", ffmpegArgs);
    } else {
        // Already MP3; proceed directly.
        checkAndDownloadModel();
    }
    saveSettings();
}

void MainWindow::exitProcesses()
{
    for (int i = processList.size() - 1; i >= 0; --i) {
        QProcess* proc = processList[i];
        proc->kill();                // Safe even if already finished
        processList.removeAt(i);
    }
    ui->console->appendPlainText("The user stopped the process.");
}

void MainWindow::clearConsole()
{
    ui->console->clear();
}




