#include "mainwindow.h"
#include "ui_mainwindow.h"

#include <QFile>
#include <QFileInfo>
#include <QMessageBox>
#include <QProcess>
#include <QFileDialog>
#include <QThread>
#include <QTimer>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
{
    ui->setupUi(this);

    connect(ui->openFile, &QPushButton::clicked,
            this, &MainWindow::onOpenFileClicked);
    ui->console->setReadOnly(true);

}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::onOpenFileClicked()
{
    // Open a file dialog to pick any audio file
    QString filePath = QFileDialog::getOpenFileName(
        this,
        tr("Open Audio File"),
        QString(),
        tr("Audio Files (*.mp3 *.m4a *.wav *.ogg *.flac *.aac *.wma *.opus);;All Files (*)")
        );

    // If the user selected a file (did not cancel)
    if (!filePath.isEmpty()) {
        processAudioFile(filePath);
    }
}

void MainWindow::processAudioFile(const QString &inputFilePath)
{
    // 1. Validate input file.
    if (inputFilePath.isEmpty()) {
        ui->console->appendPlainText("No audio file specified. Please drag and drop a file or use 'Open With'.");
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
    QString outputFile = inputInfo.absolutePath() + "/" + inputInfo.completeBaseName() + ".txt";
    QString mp3File = inputInfo.absolutePath() + "/" + inputInfo.completeBaseName() + ".mp3";
    QString ext = inputInfo.suffix().toLower();

    auto runWhisper = [this, outputFile, mp3File]() {
        // Build the model filename from the combo box.
        QString modelParam = "ggml-" + ui->model->currentText() + ".bin";
        QString exeDir = QCoreApplication::applicationDirPath();
        QString modelPath = exeDir + "/models/" + modelParam;
        QString whisperCliPath = exeDir + "/whisper-cli.exe";

        // Build the arguments.
        QStringList whisperArgs;
        whisperArgs << "-m" << modelPath
                    << "-f" << mp3File   // explicitly use the converted MP3 file
                    << "-otxt"
                    << "-l" << "en"
                    << "-tp" << "0.0"
                    << "-mc" << "64"
                    << "-et" << "3.0";

        // Log the full command to the console.
        QString commandLine = whisperCliPath + " " + whisperArgs.join(" ");
        ui->console->appendPlainText("Running: " + commandLine);

        // Create and configure the process.
        QProcess *whisperProcess = new QProcess(this);
        whisperProcess->setProcessChannelMode(QProcess::MergedChannels);

        // Log all output from the process to the console.
        connect(whisperProcess, &QProcess::readyRead, this, [this, whisperProcess]() {
            QByteArray data = whisperProcess->readAll();
            ui->console->appendPlainText(QString::fromLocal8Bit(data));
        });

        // Log any errors that occur.
        connect(whisperProcess, &QProcess::errorOccurred, this, [this, whisperProcess]() {
            ui->console->appendPlainText("Whisper process error: " + whisperProcess->errorString());
        });

        // When finished, check the exit code and then open the output file.
        connect(whisperProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [this, outputFile, whisperProcess](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        ui->console->appendPlainText("Whisper processing complete.");
                        QTimer::singleShot(2000, [outputFile]() {
                            QProcess::startDetached("notepad.exe", QStringList() << outputFile);
                        });
                    } else {
                        ui->console->appendPlainText("Whisper process failed. Exit code: " + QString::number(exitCode));
                    }
                    whisperProcess->deleteLater();
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
                            if (fi.size() < 10 * 1024) { // e.g., less than 10 KB
                                ui->console->appendPlainText("Downloaded model appears to be too small (" + QString::number(fi.size()) + " bytes).");
                            } else {
                                ui->console->appendPlainText("Model downloaded successfully: " + modelPath);
                                runWhisper();
                            }
                        } else {
                            ui->console->appendPlainText("Failed to download model. Exit code: " + QString::number(exitCode));
                        }
                        downloadProcess->deleteLater();
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
                    }
                    ffmpegProcess->deleteLater();
                });
        ffmpegProcess->start("ffmpeg", ffmpegArgs);
    } else {
        // Already MP3; proceed directly.
        checkAndDownloadModel();
    }
}





