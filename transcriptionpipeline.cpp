#include "transcriptionpipeline.h"
#include <QFileInfo>
#include <QCoreApplication>
#include <QTimer>
#include <QDir>
#include <QUrl>
#include <QFile>
#include <QProcess>

TranscriptionPipeline::TranscriptionPipeline(
    QPlainTextEdit *console,
    QComboBox *model,
    QComboBox *language,
    QCheckBox *txtCheckbox,
    QCheckBox *srtCheckbox,
    QCheckBox *cpuCheckbox,
    QPlainTextEdit *arguments,
    QList<QProcess*> *processList,
    QObject *parent)
    : QObject(parent),
    console(console),
    model(model),
    language(language),
    txtCheckbox(txtCheckbox),
    srtCheckbox(srtCheckbox),
    cpuCheckbox(cpuCheckbox),
    arguments(arguments),
    processList(processList)
{}

void TranscriptionPipeline::start(const QString &inputFilePath)
{
    if (inputFilePath.isEmpty()) {
        console->appendPlainText("No media file specified. Please drag and drop a file or use 'Open With'.");
        emit finished();
        return;
    }
    QFileInfo inputInfo(inputFilePath);
    if (!inputInfo.exists()) {
        console->appendPlainText("Error: File not found.");
        emit finished();
        return;
    }
    m_filePath = inputInfo.absoluteFilePath();
    console->appendPlainText("Input file: " + m_filePath);

    QString mp3File = inputInfo.absolutePath() + "/" + inputInfo.completeBaseName() + ".mp3";
    QString outputFile = mp3File + ".txt";
    QString ext = inputInfo.suffix().toLower();

    // 1. Whisper run lambda
    auto runWhisper = [=]() {
        QString modelParam = "ggml-" + model->currentText() + ".bin";
        QString exeDir = QCoreApplication::applicationDirPath();
        QString modelPath = exeDir + "/models/" + modelParam;
        QString whisperCliPath = exeDir + "/whisper-cli.exe";

        QString extraArgs = arguments->toPlainText();
        QStringList parsedArgs = QProcess::splitCommand(extraArgs);

        QString txtFlag = txtCheckbox->isChecked() ? "-otxt" : "";
        QString srtFlag = srtCheckbox->isChecked() ? "-osrt" : "";
        QString cpuFlag = cpuCheckbox->isChecked() ? "--no-gpu" : "";

        QStringList whisperArgs;
        whisperArgs << "-m" << modelPath
                    << "-f" << mp3File
                    << txtFlag << srtFlag << cpuFlag
                    << "-l" << language->currentText()
                    << parsedArgs;

        QString commandLine = whisperCliPath + " " + whisperArgs.join(" ");
        console->appendPlainText("Running: " + commandLine);

        QProcess *whisperProcess = new QProcess(this);
        processList->append(whisperProcess);

        whisperProcess->setProcessChannelMode(QProcess::MergedChannels);

        connect(whisperProcess, &QProcess::readyRead, this, [=]() {
            QByteArray data = whisperProcess->readAll();
            console->appendPlainText(QString::fromLocal8Bit(data));
        });

        connect(whisperProcess, &QProcess::errorOccurred, this, [=]() {
            console->appendPlainText("Whisper process error: " + whisperProcess->errorString());
            emit finished();
        });

        connect(whisperProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [=](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (!txtCheckbox->isChecked())
                        console->appendPlainText("Whisper processing complete.");
                    else if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        console->appendPlainText("Whisper processing complete. Opening file in Notepad.");
                        QTimer::singleShot(2000, [outputFile]() {
                            QProcess::startDetached("notepad.exe", QStringList() << outputFile);
                        });
                    } else {
                        console->appendPlainText("Whisper process failed. Exit code: " + QString::number(exitCode));
                    }
                    whisperProcess->deleteLater();
                    processList->removeOne(whisperProcess);
                    emit finished();
                });

        whisperProcess->start(whisperCliPath, whisperArgs);
    };

    // 2. Model download lambda
    auto checkAndDownloadModel = [=]() {
        QString modelParam = "ggml-" + model->currentText() + ".bin";
        QString exeDir = QCoreApplication::applicationDirPath();
        QString modelsDir = exeDir + "/models/";
        QDir dir(modelsDir);
        if (!dir.exists() && !dir.mkpath(modelsDir)) {
            console->appendPlainText("Failed to create models directory: " + modelsDir);
            emit finished();
            return;
        }
        QString modelPath = modelsDir + modelParam;
        QString baseUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
        QUrl modelUrl(baseUrl + modelParam);

        if (QFile::exists(modelPath)) {
            console->appendPlainText("Model file exists: " + modelPath);
            runWhisper();
        } else {
            console->appendPlainText("Model file not found: " + modelPath);
            console->appendPlainText("Downloading model from " + modelUrl.toString());
            QProcess *downloadProcess = new QProcess(this);
            processList->append(downloadProcess);
            downloadProcess->setProcessChannelMode(QProcess::MergedChannels);
            QStringList downloadArgs;
            downloadArgs << "-L" << modelUrl.toString() << "-o" << modelPath;
            connect(downloadProcess, &QProcess::readyRead, this, [=]() {
                console->appendPlainText(QString::fromLocal8Bit(downloadProcess->readAll()));
            });
            connect(downloadProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                    this, [=](int exitCode, QProcess::ExitStatus exitStatus) {
                        if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                            QFileInfo fi(modelPath);
                            if (fi.size() < 1000000) {
                                console->appendPlainText("Downloaded model appears to be too small (" + QString::number(fi.size()) + " bytes).");
                            } else {
                                console->appendPlainText("Model downloaded successfully: " + modelPath);
                                runWhisper();
                            }
                        } else {
                            console->appendPlainText("Failed to download model. Exit code: " + QString::number(exitCode));
                            QFile::remove(modelPath);
                        }
                        downloadProcess->deleteLater();
                        processList->removeOne(downloadProcess);
                    });
            downloadProcess->start("curl", downloadArgs);
        }
    };

    // 3. Convert to mp3 if needed
    if (ext != "mp3") {
        console->appendPlainText("Converting " + m_filePath + " to MP3...");
        QStringList ffmpegArgs;
        ffmpegArgs << "-n" << "-i" << m_filePath << "-q:a" << "2" << mp3File;
        QProcess *ffmpegProcess = new QProcess(this);
        processList->append(ffmpegProcess);
        ffmpegProcess->setProcessChannelMode(QProcess::MergedChannels);
        connect(ffmpegProcess, &QProcess::readyRead, this, [=]() {
            console->appendPlainText(QString::fromLocal8Bit(ffmpegProcess->readAll()));
        });
        connect(ffmpegProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
                this, [=](int exitCode, QProcess::ExitStatus exitStatus) {
                    if (exitStatus == QProcess::NormalExit && exitCode == 0) {
                        console->appendPlainText("FFmpeg conversion successful.");
                        m_filePath = mp3File;
                        checkAndDownloadModel();
                    } else {
                        console->appendPlainText("FFmpeg conversion failed. Exit code: " + QString::number(exitCode));
                        QFile::remove(mp3File);
                        emit finished();
                    }
                    ffmpegProcess->deleteLater();
                    processList->removeOne(ffmpegProcess);
                });
        ffmpegProcess->start("ffmpeg", ffmpegArgs);
    } else {
        checkAndDownloadModel();
    }
}
