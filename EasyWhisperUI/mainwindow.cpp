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

#include <QFileInfo>
#include <QProcess>
#include <QThread>
#include <QCoreApplication>

void MainWindow::processAudioFile(const QString &inputFilePath)
{
    // 1. Check if an audio file was provided
    if (inputFilePath.isEmpty()) {
        ui->console->appendPlainText("No audio file specified. Please drag and drop a file or use 'Open With'.");
        return;
    }

    // 2. Resolve full path and verify file exists
    QFileInfo inputInfo(inputFilePath);
    if (!inputInfo.exists()) {
        ui->console->appendPlainText("Error: File not found.");
        return;
    }
    // Store the full input file path in our member variable
    m_filePath = inputInfo.absoluteFilePath();
    ui->console->appendPlainText("Input file: " + m_filePath);

    // 3. Determine output file names (for transcription and MP3 conversion)
    QString outputFile = inputInfo.absolutePath() + "/" + inputInfo.completeBaseName() + ".txt";
    QString mp3File = inputInfo.absolutePath() + "/" + inputInfo.completeBaseName() + ".mp3";

    // 4. Determine file extension (in lowercase)
    QString ext = inputInfo.suffix().toLower();

    // Define a lambda to start the whisper-cli process.
    // It uses m_filePath (which may have been updated to the MP3 version) and the selected model.
    auto startWhisperProcess = [this, outputFile]() {
        // Get model parameter from the QComboBox named "model"
        QString modelParam = ui->model->currentText();
        QString exeDir = QCoreApplication::applicationDirPath();
        QString modelPath = exeDir + "/models/" + "ggml-"+modelParam+".bin";
        QString whisperCliPath = exeDir + "/whisper-cli.exe";

        QStringList whisperArgs;
        whisperArgs << "-m" << modelPath
                    << "-f" << m_filePath
                    << "-otxt"
                    << "-l" << "en"
                    << "-tp" << "0.0"
                    << "-mc" << "64"
                    << "-et" << "3.0";

        ui->console->appendPlainText("Starting whisper-cli with model " + modelParam + "...");
        QProcess *whisperProcess = new QProcess(this);
        whisperProcess->setProcessChannelMode(QProcess::MergedChannels);
        connect(whisperProcess, &QProcess::readyRead, this, [this, whisperProcess]() {
            QByteArray data = whisperProcess->readAll();
            ui->console->appendPlainText(QString::fromLocal8Bit(data));
        });
        connect(whisperProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [this, outputFile, whisperProcess](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        ui->console->appendPlainText("Whisper processing complete.");
                        // After a 2-second delay, open the transcription file in Notepad
                        QTimer::singleShot(2000, [outputFile]() {
                            QProcess::startDetached("notepad.exe", QStringList() << outputFile);
                        });
                    } else {
                        ui->console->appendPlainText("Whisper process failed. Exit code: " + QString::number(exitCode));
                    }
                    whisperProcess->deleteLater();
                });
        whisperProcess->start(whisperCliPath, whisperArgs);
    };

    // 5. If the input file is not already an MP3, convert it asynchronously using FFmpeg.
    if (ext != "mp3") {
        ui->console->appendPlainText("Converting " + m_filePath + " to MP3...");
        QStringList ffmpegArgs;
        ffmpegArgs << "-n"
                   << "-i" << m_filePath
                   << "-q:a" << "2"
                   << mp3File;
        QProcess *ffmpegProcess = new QProcess(this);
        ffmpegProcess->setProcessChannelMode(QProcess::MergedChannels);
        connect(ffmpegProcess, &QProcess::readyRead, this, [this, ffmpegProcess]() {
            QByteArray data = ffmpegProcess->readAll();
            ui->console->appendPlainText(QString::fromLocal8Bit(data));
        });
        connect(ffmpegProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [this, mp3File, ffmpegProcess, startWhisperProcess](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        ui->console->appendPlainText("FFmpeg conversion successful.");
                        // Update the member m_filePath to use the new MP3 file for transcription.
                        m_filePath = mp3File;
                        // Now start the whisper-cli process.
                        startWhisperProcess();
                    } else {
                        ui->console->appendPlainText("FFmpeg conversion failed. Exit code: " + QString::number(exitCode));
                    }
                    ffmpegProcess->deleteLater();
                });
        ffmpegProcess->start("ffmpeg", ffmpegArgs);
    } else {
        // If already MP3, start whisper immediately.
        startWhisperProcess();
    }
}


